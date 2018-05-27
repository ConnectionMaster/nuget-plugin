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
var asyncCounter;

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

    // always start with check policies compliance

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
    var downloadLinks = {};

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
    } else if (filePath.endsWith('.csproj')) {
        getLinksFromCsprojXml(filePath, asyncFilesCount, downloadLinks, partialRequestBody, projectInfos, onReadyLinks);
    } else {
        // other files parsing.
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
                            var pkgId = pkg.id.toLowerCase();
                            var pkgVersion = pkg.version.toLowerCase();
                            var downloadUrl = format(globalConf.repositoryUrl, pkg.id.toLowerCase(), pkg.version.toLowerCase());
                            var pkgFileName = pkgId + "." + pkgVersion + ".nupkg";
                            downloadLinks[downloadUrl] = pkgFileName;
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
            //var uniqueLinks = utilities.removeDuplicatePrimitivesFromArray(downloadLinks);
            callback(partialRequestBody, projectInfos, downloadLinks);
        }
    });
}

/**
 * Parse .csproj xml file to json, extract all nuget packages (pkg name and version) and create download links
 */
function getLinksFromCsprojXml(filePath, asyncConfigFilesCount, downloadLinks, partialRequestBody, projectInfos, callback) {
    utilities.xmlToJson(filePath, function (err, jsonCsproj) {
        var csprojFile = filePath.substring(filePath.lastIndexOf('\\') + 1);
        if (err) {
            logger.error('Unable to read ' + csprojFile + 'Make sure the file exists and is properly formatted. Skipping...');
        } else {
            logger.debug('Xml config file ' + filePath + ' as json: ' + JSON.stringify(jsonCsproj));
            if (jsonCsproj) {
                if (jsonCsproj.Project) {
                    var itemGroupArray = jsonCsproj.Project.ItemGroup;
                    if (itemGroupArray) {
                        for (var i = 0; i < itemGroupArray.length; i++) {
                            var packageReferences = itemGroupArray[i]['PackageReference'];
                            if (packageReferences) {
                                for (var j = 0; j < packageReferences.length; j++) {
                                    var package = packageReferences[j]['$'];
                                    if (package && package.Include && package.Version) {
                                        if (!globalConf.devDependencies && isPackagePrivateAssetsAll(packageReferences[j])) {
                                            continue;
                                        }
                                        var pkgId = package.Include.toLowerCase();
                                        var pkgVersion = package.Version.toLowerCase();
                                        var downloadUrl = format(globalConf.repositoryUrl, pkgId, pkgVersion);
                                        var pkgFileName = pkgId + "." + pkgVersion + ".nupkg";
                                        downloadLinks[downloadUrl] = pkgFileName;
                                    }
                                }
                            }
                        }
                    } else {
                        logger.error(csprojFile + 'file doesn\'t contain an ItemGroup tag. ' +
                            'Make sure to the file is well formatted. Skipping...');
                    }
                } else {
                    logger.error(csprojFile + 'file doesn\'t contain a Project tag. ' +
                        'Make sure to the file is well formatted. Skipping...');
                }
            } else {
                logger.error(csprojFile + 'file doesn\'t contain a Project tag. ' +
                    'Make sure to the file is well formatted. Skipping...');
            }
        }
        asyncConfigFilesCount.count--;
        // After download links from all nuget conf files are collected and parsed, download them
        if (asyncConfigFilesCount.count === 0) {
            //var uniqueLinks = utilities.removeDuplicatePrimitivesFromArray(downloadLinks);
            callback(partialRequestBody, projectInfos, downloadLinks);
        }
    });
}

function isPackagePrivateAssetsAll(package) {
    var privateAssets = package.PrivateAssets;
    if (privateAssets && privateAssets.length == 1) {
        if (privateAssets[0].toLowerCase() == "all") {
            return true;
        }
    }
    return false;
}

/**
 * Download all pkgs, calculate sha1 and send request
 */
function onReadyLinks(partialRequestBody, projectInfos, downloadLinks) {
    utilities.mkdir(tmpFolderPath);
    var links = Object.keys(downloadLinks);
    asyncCounter = links.length; // counter to wait for all async download actions to be done
    var dependencies = [];
    var missedDependencies = [];

    for (var i = 0; i < links.length; i++) {
        var link = links[i];
        var filename = downloadLinks[link];

        utilities.downloadFile(link, filename, tmpFolderPath, globalConf.privateRegistryUsername, globalConf.privateRegistryPassword, function (err, url, name, file) {
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
                createDependencyInfo(partialRequestBody, projectInfos, dependencies, missedDependencies, file, onDependenciesReady);
            }
        });
    }
}

/**
 * Once all files downloaded and sha1 calculated send request
 */
function createDependencyInfo(partialRequestBody, agentProjectInfos, dependencies, missedDependencies, file, callback) {
    utilities.calculateSha1(file, function (sha1) {
        if (sha1 != null && sha1 != "") {
            var dependency = {
                'artifactId': file.substring(file.lastIndexOf('\\') + 1),
                'sha1': sha1
            };

            dependencies.push(dependency);
        }

        asyncCounter--;
        if (asyncCounter === 0) {
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

// new method of creating the policy rejection summery
var getPolicyRejectionSummary = function (resJson) {
    var cleanRes = utilities.cleanJson(resJson);
    var response = JSON.parse(cleanRes);
    try {
        var responseData = JSON.parse(response.data);
    } catch (e) {
        cli.error("Failed to find policy violations.");
        return null;
    }

    function RejectedPolicy(policy) {
        this.policyName = policy.displayName;
        this.filterType = policy.filterType;
        this.productLevel = policy.projectLevel;
        this.inclusive = policy.inclusive;
        this.rejectedLibraries = [];
        this.equals = function (newPolicy) {
            if (this === newPolicy) {
                return true;
            }
            if (!(newPolicy instanceof RejectedPolicy)) {
                return false;
            }
            return this.policyName == newPolicy.policyName;
        }
    }

    function RejectedLibrary(resource) {
        this.name = resource.displayName;
        this.sha1 = resource.sha1;
        this.link = resource.link;
        this.project = [];
        this.equals = function (rejectedLibrary) {
            if (this === rejectedLibrary) {
                return true;
            }
            if (!(rejectedLibrary instanceof RejectedLibrary)) {
                return false;
            }
            if (this.name != null && this.name != rejectedLibrary.name) {
                return false;
            }
            if (this.sha1 != null && this.sha1 == rejectedLibrary.sha1) {
                return true;
            }
            return false;
        }
    }

    var violations = [];

    function checkRejection(child, nameOfProject) {
        if (child.hasOwnProperty('policy') && child.policy.actionType === "Reject") {
            //cli.error("Policy violation found! Package: " + child.resource.displayName + " | Policy: " + child.policy.displayName);
            if (!isPolicyExistInViolations(child.policy.displayName, child.resource, nameOfProject)) {
                var rejectedPolicy = new RejectedPolicy(child.policy);
                var rejectedLibrary = new RejectedLibrary(child.resource);
                rejectedLibrary.project.push(nameOfProject);
                rejectedPolicy.rejectedLibraries.push(rejectedLibrary);
                violations.push(rejectedPolicy);
            }
        }
        for (var i = 0; i < child.children.length; i++) {
            checkRejection(child.children[i], nameOfProject);
        }
    }

    function isPolicyExistInViolations(policyName, resource, nameOfProject) {
        for (var i = 0; i < violations.length; i++) {
            if (policyName == violations[i].policyName) {
                var library = new RejectedLibrary(resource);
                if (!isLibraryExistInPolicy(violations[i].rejectedLibraries, library, nameOfProject)) {
                    library.project.push(nameOfProject);
                    violations[i].rejectedLibraries.push(library);
                }
                return true;
            }
        }
        return false;
    }

    function isLibraryExistInPolicy(rejectedLibraries, library, nameOfProject) {
        for (var i = 0; i < rejectedLibraries.length; i++) {
            if (library.equals(rejectedLibraries[i])) {
                rejectedLibraries[i].project.push(nameOfProject);
                return true;
            }
        }
        return false;
    }

    function projectHasRejections(project, nameOfProject) {
        if (project.hasOwnProperty("children")) {
            for (var i = 0; i < project.children.length; i++) {
                checkRejection(project.children[i], nameOfProject);
            }
        }
    }

    if (responseData.hasOwnProperty("existingProjects")) {
        var existingProjects = responseData.existingProjects;
        for (var existingProject in existingProjects) {
            // skip loop if the property is from prototype
            if (!existingProjects.hasOwnProperty(existingProject)) continue;
            var proj = existingProjects[existingProject];
            projectHasRejections(proj, existingProject);
        }
    }
    if (responseData.hasOwnProperty("newProjects")) {
        var newProjects = responseData.newProjects;
        for (var newProject in newProjects) {
            // skip loop if the property is from prototype
            if (!newProjects.hasOwnProperty(newProject)) continue;
            var obj = newProjects[newProject];
            projectHasRejections(obj, newProject);
        }
    }
    return violations;
};

function sendRequestToServer(requestBody, projectInfos, dependencies) {
    var requestBodyStringifiedCheckPolicies = initializeRequestBodyType('CHECK_POLICY_COMPLIANCE', requestBody, projectInfos, dependencies);
    logger.info("Checking Policies");
    utilities.postRequest(globalConf.wssUrl, 'POST', requestBodyStringifiedCheckPolicies, globalConf.requestAgent, function (responseBody) {
        if (JSON.parse(responseBody).status === 1) {
            var violations = getPolicyRejectionSummary(responseBody);
            if (violations != null && violations.length > 0) {
                logger.error("Some dependencies did not conform with open source policies, review report for details");
                logger.error("=== UPDATE ABORTED ===");
                logger.debug(JSON.stringify(violations));
            } else {
                logger.info("All dependencies conform with open source policies.");
                if (cmdArgs.action === 'UPDATE') {
                    var requestBodyStringifiedUpdate = initializeRequestBodyType('UPDATE', requestBody, projectInfos, dependencies);
                    utilities.postRequest(globalConf.wssUrl, 'POST', requestBodyStringifiedUpdate, globalConf.requestAgent, function (responseBody) {
                        logger.info('Server response:\n' + prettyJson.render(JSON.parse(responseBody)));
                    });
                }
            }
        } else {
            logger.error('Server response: ' + prettyJson.render(JSON.parse(responseBody).data));
            logger.error("Build failed!");
        }
    });
}

function initializeRequestBodyType(type, requestBody, projectInfos, dependencies) {
    requestBody.type = type;
    projectInfos[0].dependencies = dependencies;
    var requestBodyStringified = queryString.stringify(requestBody);
    requestBodyStringified += "&diff=" + JSON.stringify(projectInfos);
    return requestBodyStringified;
}




