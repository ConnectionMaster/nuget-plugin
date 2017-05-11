/**
 * Created by Yossi.Weinberg on 5/4/2017.
 */

var ConfBuilder = exports;
exports.constructor = function ConfBuilder() {
};

var Utilities = require('./utilities');
var logger = Utilities.getLogger();

ConfBuilder.createPostRequestBody = function (conf, pluginAction) {
    var requestBody = {
        'agent': 'nuget-plugin',
        'agentVersion': '1.0',
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

ConfBuilder.createGlobalConfiguration = function (conf) {
    var globalConf = {
        'wssUrl': 'https://saas.whitesourcesoftware.com/agent',
        'repositoryUrl': 'https://api.nuget.org/v3-flatcontainer/{0}/{1}/{0}.{1}.nupkg',
        'devDependencies': false
    };

    globalConf.wssUrl = conf.wssUrl ? conf.wssUrl : globalConf.wssUrl;
    globalConf.devDependencies = conf.devDependencies ? conf.devDependencies : globalConf.devDependencies;
    globalConf.repositoryUrl = conf.repositoryUrl ? conf.repositoryUrl : globalConf.repositoryUrl;

    logger.debug('Global configuration after validation: ' + JSON.stringify(globalConf));
    return globalConf;
};

ConfBuilder.processProjectIdentification = function (conf, confFileName) {
    var agentProjectInfo = {
        'projectToken': undefined,
        'coordinates': {}
    };

    // todo add check to project identification and product and notify of strange behavior?
    // validate and add project token
    if (conf.projectToken) {
        if (conf.projectToken.length !== 36) {
            logger.warn('Project token should be 36 characters long, token will be ignored.');
        } else {
            agentProjectInfo.projectToken = conf.projectToken;
        }
    }

    // if valid token and project name then ignore project name otherwise use it
    if ((conf.projectToken && conf.projectToken.length === 36) && conf.projectName) {
        logger.warn('Can\'t use both project token and project name in configuration, project name will be ignored.');
    } else {
        if (conf.projectName) {
            agentProjectInfo.coordinates.artifactId = conf.projectName;
            if (conf.projectVersion) {
                agentProjectInfo.coordinates.version = conf.projectVersion;
            }
        } else { // if no name or token give name as default according to nuget conf filename todo update what if conf name is the same among projects?
            if (!agentProjectInfo.projectToken) {
                var nameFromFile = confFileName.substring(confFileName.lastIndexOf('\\') + 1);
                agentProjectInfo.coordinates.artifactId = nameFromFile;
            }
        }
    }
    logger.debug('Agent project info after validation: ' + JSON.stringify(agentProjectInfo));
    return agentProjectInfo;
};

function processOrgToken(requestBody, conf) {
    // validate & add org token
    if (!conf.apiKey) {
        logger.error('Organizational api key is not configured, please update the configuration file. Exiting process...');
        process.exit(0);
    }
    if (conf.apiKey.length !== 36) {
        logger.error('Organizational api key should be 36 characters long. Exiting process...');
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