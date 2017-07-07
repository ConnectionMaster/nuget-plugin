#!/usr/bin/env node
/**
 * Created by Yossi.Weinberg on 4/28/2017.
 */

var format = require('string-format'),
    osTmpdir = require('os-tmpdir'),
    path = require('path'),
    fs = require('fs'),
    queryString = require('querystring'),
    prettyJson = require('prettyjson'),
    dateFormat = require('dateformat'),
    utilities = require('./utilities'),
    confBuilder = require('./confBuilder'),
    cmd = require('./cmdArgs');

/*------------------*/
/* Global Variables */
/*------------------*/
var logger;
var cmdArgs;
var tmpFolderPath;
var confFile;
var globalConf;

run();

function run() {
    console.log('***** Initialized Nuget plugin ' + dateFormat(Date.now(), 'isoDateTime') + ' *****');
    initializeGlobalVariables();

    // Parse & validate conf file and create partial request params - this is done before everything else to make sure all params are valid before the actual plugin execution
    var configFiles = confBuilder.getAllNugetConfigFiles(confFile);
    var projectInfos = [confBuilder.processProjectIdentification(confFile)];
    var partialRequestBody = confBuilder.createPostRequestBody(confFile, cmdArgs.action);
    collectNugetDownloadLinks(configFiles, partialRequestBody, projectInfos);
}

/**
 * Initialize all variables that should have global access
 */
function initializeGlobalVariables() {
    logger = utilities.getLogger();
    cmdArgs = cmd.getCmdArgs();
    tmpFolderPath = osTmpdir() + path.sep + 'Ws-nuget-temp';

    try {
        confFile = utilities.loadJsonFile(cmdArgs.ws_config);
        logger.debug('Configuration file: ' + JSON.stringify(confFile));
    } catch (err) {
        logger.error('Unable to read/parse Ws Nuget configuration file. Exiting...\n' + err);
        process.exit(0);
    }

    globalConf = confBuilder.createGlobalConfiguration(confFile);
}

function collectNugetDownloadLinks(configFilesArray, requestBody, projectInfos) {
    var asyncFilesCount = {count: configFilesArray.length}; // wait all async methods to finish - an object and not a primitive since js doesn't allow to pass primitives by reference
    var downloadLinks = [];

    for (var i = 0; i < configFilesArray.length; i++) {
        decideParseMethod(configFilesArray[i], asyncFilesCount, downloadLinks, requestBody, projectInfos);
    }
}

/**
 * Currently only supports parsing packages.config files
 */
function decideParseMethod(filePath, asyncFilesCount, downloadLinks, partialRequestBody, projectInfos) {
    if (filePath.endsWith('.config')) {
        getLinksFromConfigXml(filePath, asyncFilesCount, downloadLinks, partialRequestBody, projectInfos, onReadyLinks);
    } else {
        // other files parsing
    }
}

/**
 * Parse packages.config xml file to json, extract all nuget packages (pkg name and version) and create download links
 */
function getLinksFromConfigXml(filePath, asyncConfigFilesCount, downloadLinks, partialRequestBody, projectInfos, callback) {
    utilities.xmlToJson(filePath, function (err, jsonConfig) {
        var confFile = filePath.substring(filePath.lastIndexOf('\\') + 1);
        if (err) {
            logger.error('Unable to read ' + confFile + ' nuget configuration file. ' +
                'Make sure the file exists and is properly formatted. Skipping...');
            asyncConfigFilesCount.count--;
        } else {
            // Json object from xml has the following format:
            // {"packages":{"package":
            // [{"$":{"id":"","version":"","targetFramework":""}},{"$":{"id":"","version":"","targetFramework":""}}]}}
            logger.debug('Xml config file ' + filePath + ' as json: ' + JSON.stringify(jsonConfig));
            if (jsonConfig && jsonConfig.packages) {
                if (jsonConfig.packages.package) {
                    var nugetPackages = jsonConfig.packages.package;
                    for (var i = 0; i < nugetPackages.length; i++) {
                        if (nugetPackages[i]['$']) {
                            var pkg = nugetPackages[i]['$'];
                            if (pkg.developmentDependency && !globalConf.devDependencies) {
                                continue;
                            }
                            var downloadUrl = format(globalConf.repositoryUrl, pkg.id.toLowerCase(), pkg.version.toLowerCase());
                            downloadLinks.push(downloadUrl);
                        }
                    }
                    asyncConfigFilesCount.count--;
                } else {
                    logger.error(confFile + 'file doesn\'t contain a packages tag. ' +
                        'Make sure to the file is well formatted. Skipping...');
                    asyncConfigFilesCount.count--;
                }
            } else {
                logger.error(confFile + ' file doesn\'t contain a packages tag. ' +
                    'Make sure to the file is well formatted. Skipping...');
                asyncConfigFilesCount.count--;
            }
        }
        // After download links from all nuget conf files are collected and parsed, download them
        if (asyncConfigFilesCount.count === 0) {
            var uniqueLinks = utilities.removeDuplicatePrimitivesFromArray(downloadLinks);
            callback(partialRequestBody, projectInfos, uniqueLinks);
        }
    });
}

/**
 * Download all pkgs, calculate sha1 and send request
 */
function onReadyLinks(partialRequestBody, projectInfos, downloadLinks) {
    utilities.mkdir(tmpFolderPath);
    var asyncCounter = downloadLinks.length; // counter to wait for all async download actions to be done
    var dependencies = [];
    var missedDependencies = [];

    for (var i =0; i < downloadLinks.length; i++) {
        var link = downloadLinks[i];
        var filename = link.substring(link.lastIndexOf('/') + 1);

        utilities.downloadFile(link, filename, tmpFolderPath, function (err, url, name, file) {
            if (err) {
                if (err.statusCode === 404) {
                    logger.debug('Unable to find ' + name + ' in the public nuget repository');
                } else {
                    var errorMsg = '';
                    if (err.statusCode) {
                        errorMsg += ' with code ' + err.statusCode;
                    }
                    if (err.message) {
                        errorMsg += '. Further information: ' + err.message;
                    }
                    logger.error('Error downloading ' + name + errorMsg);
                }
                --asyncCounter; // reduced even if no download is available - otherwise process will never continue
                missedDependencies.push({filename: name, link: url});
                if (asyncCounter === 0) {
                    sendScanResult(partialRequestBody, projectInfos, dependencies, missedDependencies, onDependenciesReady);
                }
            } else {
                createDependencyInfo(partialRequestBody, projectInfos, dependencies, missedDependencies, file, --asyncCounter, onDependenciesReady);
            }
        });
    }
}

/**
 * Once all files downloaded and sha1 calculated send request
 */
function createDependencyInfo(partialRequestBody, agentProjectInfos, dependencies, missedDependencies, file, asyncDownloadCounter, callback) {
    utilities.calculateSha1(file, function (sha1) {
        var dependency = {
            'artifactId' : file.substring(file.lastIndexOf('\\') + 1),
            'sha1' : sha1
        };

        dependencies.push(dependency);

        if (asyncDownloadCounter === 0) {
            sendScanResult(partialRequestBody, agentProjectInfos, dependencies, missedDependencies, callback);
        }
    });
}

function sendScanResult(partialRequestBody, agentProjectInfos, dependencies, missedDependencies, callback) {
    if (missedDependencies.length > 0) {
        logger.warn('Unable to resolve the following nuget packages:\n' + prettyJson.render(missedDependencies));
    }
    logger.debug('Collected dependencies are: ' + JSON.stringify(dependencies));
    callback(partialRequestBody, agentProjectInfos, dependencies)
}

function onDependenciesReady(partialRequestBody, projectInfos, dependencies) {
    utilities.rm(tmpFolderPath);
    sendRequestToServer(partialRequestBody, projectInfos, dependencies);
}

function sendRequestToServer(requestBody, projectInfos, dependencies) {
    projectInfos[0].dependencies = dependencies;
    var requestBodyStringified = queryString.stringify(requestBody);
    requestBodyStringified += "&diff=" + JSON.stringify(projectInfos);
    utilities.postRequest(globalConf.wssUrl, 'POST', requestBodyStringified, globalConf.requestAgent, function (responseBody) {
        logger.info('Server response:\n' + prettyJson.render(JSON.parse(responseBody)));
    })
}