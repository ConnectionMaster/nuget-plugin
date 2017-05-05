/**
 * Created by Yossi.Weinberg on 4/28/2017.
 */

var format = require('string-format'),
    osTmpdir = require('os-tmpdir'),
    path = require('path'),
    fs = require('fs'),
    queryString = require('querystring'),
    utilities = require('./utilities'),
    confBuilder = require('./confBuilder'),
    cmd = require('./cmdArgs');


/* Global Variables */
var logger;
var cmdArgs;
var tmpFolderPath;
var configurationFromFile;
var globalConf;
var repositoryUrlPattern = 'https://api.nuget.org/v3-flatcontainer/{0}/{1}/{0}.{1}.nupkg';

var dependencies = [];
var agentProjectInfos = [];
var requestBody;

run();

function run() {
    initializeGlobalVariables();

    requestBody = confBuilder.createPostRequestBody(configurationFromFile, cmdArgs.action);
    globalConf = confBuilder.createGlobalConfiguration(configurationFromFile);

    agentProjectInfos.push(confBuilder.processProjectIdentification(configurationFromFile));
    getLinksFromXmlConfigFile(cmdArgs.nuget_config, onLinksAction);
}

function initializeGlobalVariables() {
    logger = utilities.getLogger();
    cmdArgs = cmd.getCmdArgs();
    tmpFolderPath = osTmpdir() + path.sep + 'Ws-nuget-temp';

    try {
        configurationFromFile = utilities.loadJsonFile(cmdArgs.ws_config);
    } catch (err) {
        logger.error('Unable to read Ws Nuget configuration file. Exiting...\n' + err);
        process.exit(0);
    }
}

// method to parse packageConfig.xml file
function getLinksFromXmlConfigFile(xmlPath, onAllLinks) {
    var downloadLinks = [];
    utilities.xmlToJson(xmlPath, function (err, jsonConfig) {
        if (err) {
            logger.error('Unable to read ' + xmlPath + ' configuration file. Exiting...');
            process.exit(0);
        } else {
            if (jsonConfig.packages) {
                if (jsonConfig.packages.package) {
                    var nugetPackages = jsonConfig.packages.package;
                    for (var i = 0; i < nugetPackages.length; i++) {
                        if (nugetPackages[i]['$']) {
                            var pkg = nugetPackages[i]['$'];
                            if (pkg.developmentDependency && globalConf.devDependencies) {
                                continue;
                            }
                            var downloadUrl = format(repositoryUrlPattern, pkg.id.toLowerCase(), pkg.version.toLowerCase());
                            downloadLinks.push(downloadUrl);
                        }
                    }
                    onAllLinks(downloadLinks);
                } else {
                    //todo deal with
                }
            } else {
                //todo deal with
            }
        }
    });
}

function onLinksAction(downloadLinks) {
    utilities.mkdir(tmpFolderPath);
    var asyncDownloadCounter = downloadLinks.length;
    for (var i =0; i < asyncDownloadCounter; i++) {
        var link = downloadLinks[i];
        var filename = link.substring(link.lastIndexOf('/') + 1);
        utilities.downloadFile(link, filename, tmpFolderPath, function (err, name, file) {
            if (err) { // todo decide on log level for err
                if (err.statusCode === 404) {
                    logger.info('Unable to find ' + name + ' in the public nuget repository');
                } else {
                    logger.info('Error downloading ' + name + ' with error code ' + err.statusCode);
                }
            } else {
                createDependencyInfo(file);
            }

            if (--asyncDownloadCounter === 0) {
                utilities.rm(tmpFolderPath);
                sendRequestToServer();
            }
        });
    }
}

function createDependencyInfo(file) {
    utilities.calculateSha1(file, function (sha1) {
        dependencies.push({
            'artifactId' : file.substring(file.lastIndexOf('/') + 1),
            'sha1' : sha1
        });
    });
}

function sendRequestToServer() {
    if (requestBody) {
        agentProjectInfos[0].dependencies = dependencies;
        var requestBodyStringified = queryString.stringify(requestBody);
        requestBodyStringified += "&diff=" + JSON.stringify(agentProjectInfos);
        utilities.postRequest('http://localhost:8081/agent', 'POST', requestBodyStringified, function (responseBody) {
            console.log(responseBody);
        }, function (err) {
            console.log(err);
        })
    } else {
        // todo deal with error properly
        logger.error("no request body ---- errrrrorrr "); //todo remove in production
    }
}