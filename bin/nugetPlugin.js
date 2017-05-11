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

    // Parse & validate conf file and create partial request params -
    // this is done before everything else to make sure all params are valid before the actual plugin execution
    var partialRequestBody = confBuilder.createPostRequestBody(confFile, cmdArgs.action);
    var projectInfos = [confBuilder.processProjectIdentification(confFile, cmdArgs.nuget_config)];

    // decide how to parse nuget dependencies file and run plugin
    decideParseMethod(cmdArgs.nuget_config, partialRequestBody, projectInfos);
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

/**
 * Currently only supports parsing packages.config files
 */
function decideParseMethod(filePath, partialRequestBody, projectInfos) {
    if (filePath.endsWith('.config')) {
        parseConfigXml(filePath, partialRequestBody, projectInfos, onReadyLinks)
    } else {
        // other files parsing
    }
}

/**
 * Parse packages.config xml file to json, extract all nuget packages (pkg name and version) and create download links
 */
function parseConfigXml(xmlPath, partialRequestBody, projectInfos, callback) {
    var downloadLinks = [];
    utilities.xmlToJson(xmlPath, function (err, jsonConfig) {
        var confFile = xmlPath.substring(xmlPath.lastIndexOf('\\') + 1);
        if (err) {
            logger.error('Unable to read ' + confFile + ' nuget configuration file. ' +
                'Make sure the file exists and is properly formatted. Exiting...');
            process.exit(0);
        } else {
            // Json object from xml has the following format:
            // {"packages":{"package":
            // [{"$":{"id":"","version":"","targetFramework":""}},{"$":{"id":"","version":"","targetFramework":""}}]}}
            logger.debug('Xml config file ' + xmlPath + ' as json: ' + JSON.stringify(jsonConfig));
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
                    // After all download links collected and parsed download them
                    callback(partialRequestBody, projectInfos, downloadLinks);
                } else {
                    logger.error(confFile + 'file doesn\'t contain a packages tag. ' +
                        'Make sure to the file is well formatted. Exiting...');
                    process.exit(0);
                }
            } else {
                logger.error(confFile + ' file doesn\'t contain a packages tag. ' +
                    'Make sure to the file is well formatted. Exiting...');
                process.exit(0);
            }
        }
    });
}

/**
 * Download all pkgs, calculate sha1 and send request
 */
function onReadyLinks(PartialRequestBody, projectInfos, downloadLinks) {
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
                    logger.debug('Error downloading ' + name + ' with error code ' + err.statusCode);
                }
                --asyncCounter; // reduced even if no download is available - otherwise process will never continue
                missedDependencies.push({filename: name, link: url})
            } else {
                createDependencyInfo(PartialRequestBody, projectInfos, dependencies, missedDependencies, file, --asyncCounter, onDependenciesReady);
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
            'artifactId' : file.substring(file.lastIndexOf('/') + 1),
            'sha1' : sha1
        };

        dependencies.push(dependency);

        if (asyncDownloadCounter === 0) {
            if (missedDependencies.length > 0) {
                logger.warn('Unable to resolve the following nuget packages:\n' + prettyJson.render(missedDependencies));
            }
            logger.debug('Collected dependencies are: ' + JSON.stringify(dependencies));
            callback(partialRequestBody, agentProjectInfos, dependencies)
        }
    });
}

function onDependenciesReady(partialRequestBody, projectInfos, dependencies) {
    utilities.rm(tmpFolderPath);
    sendRequestToServer(partialRequestBody, projectInfos, dependencies);
}

function sendRequestToServer(requestBody, projectInfos, dependencies) {
    projectInfos[0].dependencies = dependencies;
    var requestBodyStringified = queryString.stringify(requestBody);
    requestBodyStringified += "&diff=" + JSON.stringify(projectInfos);
    utilities.postRequest(globalConf.wssUrl, 'POST', requestBodyStringified, function (responseBody) {
        logger.info('Request was successful, response:\n' + prettyJson.render(JSON.parse(responseBody)));
    })
}