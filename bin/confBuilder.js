/**
 * Created by Yossi.Weinberg on 5/4/2017.
 */

var ConfBuilder = exports;
exports.constructor = function ConfBuilder() {
};

var httpsProxyAgent = require('https-proxy-agent'),
    getProxy = require('get-proxy'),
    fs = require('fs');

var Utilities = require('./utilities');
var logger = Utilities.getLogger();

ConfBuilder.createGlobalConfiguration = function (conf) {
    var globalConf = {
        'wssUrl': 'https://saas.whitesourcesoftware.com/agent',
        // 'wssUrl': 'http://localhost:8081/agent',
        'repositoryUrl': 'https://api.nuget.org/v3-flatcontainer/{0}/{1}/{0}.{1}.nupkg',
        'devDependencies': true
    };

    globalConf.wssUrl = conf.wssUrl ? conf.wssUrl : globalConf.wssUrl;
    if (typeof(conf.devDependencies) === "boolean") {
        globalConf.devDependencies = conf.devDependencies
    }
    globalConf.repositoryUrl = conf.repositoryUrl ? conf.repositoryUrl : globalConf.repositoryUrl;
    globalConf.privateRegistryUsername = conf.privateRegistryUsername ? conf.privateRegistryUsername : null;
    globalConf.privateRegistryPassword = conf.privateRegistryPassword ? conf.privateRegistryPassword : '';

    var proxy = getProxy();
    if (proxy) {
        if (proxy.includes('@')) { // if has username and password in url
            var partialProxy = proxy.substr(proxy.lastIndexOf('@') + 1, proxy.length);
            logger.info('Authenticated proxy destination: ' + partialProxy);
        } else {
            logger.info('Proxy detected: ' + proxy);
        }
        globalConf.requestAgent = new httpsProxyAgent(proxy);
    }


    logger.debug('Global configuration after validation: ' + JSON.stringify(globalConf));
    return globalConf;
};

ConfBuilder.getAllNugetConfigFiles = function (conf) {
    var foundConfigFiles = [];
    if (conf.configurationFilesPaths) {
        conf.configurationFilesPaths.forEach(function (configFile) {
            if (!fs.existsSync(configFile)) {
                logger.warn('Nuget packaging configuration file ' + configFile + ' doesn\'t exist. Skipping...');
            } else {
                foundConfigFiles.push(configFile);
            }
        });
    }

    if (foundConfigFiles.length === 0) {
        logger.error('No nuget packaging configuration files were found, make sure ws_config.json file contains ' +
            'a valid "configurationFilesPaths" json object with valid nuget configuration files and their full path. ' +
            'Exiting...');
        process.exit(0);
    }
    return foundConfigFiles;
};

ConfBuilder.processProjectIdentification = function (conf) {
    var agentProjectInfo = {
        'projectToken': undefined,
        'coordinates': {}
    };

    // todo add check to project identification and product and notify of strange behavior?
    // validate and add project token
    if (conf.projectToken) {
        agentProjectInfo.projectToken = conf.projectToken;
    }

    // if valid token and project name then ignore project name otherwise use it
    if (conf.projectToken && conf.projectName) {
        logger.warn('Can\'t use both project token and project name in configuration, project name will be ignored.');
    } else {
        if (conf.projectName) {
            agentProjectInfo.coordinates.artifactId = conf.projectName;
            if (conf.projectVersion) {
                agentProjectInfo.coordinates.version = conf.projectVersion;
            }
        } else { // if no name or token give default name
            if (!agentProjectInfo.projectToken) {
                agentProjectInfo.coordinates.artifactId = 'Demo Project';
            }
        }
    }
    logger.debug('Agent project info after validation: ' + JSON.stringify(agentProjectInfo));
    return agentProjectInfo;
};

ConfBuilder.createPostRequestBody = function (conf, pluginAction) {
    var requestBody = {
        'agent': 'nuget-plugin',
        'agentVersion': '18.2.1',
        'timeStamp': new Date().getTime(),
        'type': pluginAction
    };

    processOrgToken(requestBody, conf);
    processProductIdentification(requestBody, conf);

    if (conf.requesterEmail) {
        requestBody.requesterEmail = conf.requesterEmail;
    }
    requestBody.forceCheckAllDependencies = conf.forceCheckAllDependencies ? conf.forceCheckAllDependencies : false;

    logger.debug('Partial post request after validation: ' + JSON.stringify(requestBody));
    return requestBody;
};

function processOrgToken(requestBody, conf) {
    // validate & add org token
    if (!conf.apiKey) {
        logger.error('Organizational api key is not configured, please update the configuration file. Exiting process...');
        process.exit(0);
    }
    requestBody.token = conf.apiKey;
}

function processProductIdentification(requestBody, conf) {
    if (conf.product) {
        requestBody.product = conf.product;
        if (conf.productVersion) {
            requestBody.productVersion = conf.productVersion;
        }
    }
}