/**
 * Created by Yossi on 5/4/2017.
 */

var ConfBuilder = exports;
exports.constructor = function ConfBuilder(){};

ConfBuilder.createPostRequestBody = function(conf, pluginAction) {
    var requestBody = {
        'agent' : 'nuget-plugin',
        'agentVersion' : '1.0',
        'timeStamp': new Date().getTime()
    };

    processRequestAction(requestBody, pluginAction);
    processOrgToken(requestBody, conf);
    processProductToken(requestBody, conf);

    if (conf.requesterEmail) {
        requestBody.requesterEmail = conf.requesterEmail;
    }

    requestBody.forceCheckAllDependencies = conf.forceCheckAllDependencies ? conf.forceCheckAllDependencies : false;

    return requestBody;
};

ConfBuilder.processProjectIdentification = function(conf) {
    var agentProjectInfo = {
        'projectToken': undefined,
        'coordinates': {}
    };

    // validate and add project token
    if (conf.projectToken) {
        if (conf.projectToken.length !== 36) {
            console.log('Project token should be 36 characters long, token will be ignored.');
        } else {
            agentProjectInfo.projectToken = conf.projectToken;
        }
    }

    // if valid token and project name then ignore project name otherwise use it
    if ((conf.projectToken && conf.projectToken.length === 36) && conf.projectName) {
        console.log('Can\'t use both project token and project name in configuration, project name will be ignored.');
    } else {
        if (conf.projectName) {
            agentProjectInfo.coordinates.artifactId = conf.projectName;
            if (conf.projectVersion) {
                agentProjectInfo.coordinates.version = conf.projectVersion;
            }
        } else { // if no name or token give default name todo maybe get name according to filename
            if(!agentProjectInfo.projectToken) {
                agentProjectInfo.coordinates.artifactId = 'My Project 1';
            }
        }
    }
    return agentProjectInfo;
};

function processOrgToken(requestBody, conf) {
    // validate & add org token
    if (!conf.apiKey) {
        console.log('#### ERROR: Organizational api key is not configured, please update the configuration file. Exiting process...');
        process.exit(0);
    }
    if (conf.apiKey.length !== 36) {
        console.log('#### ERROR: Organizational api key should be 36 characters long. Exiting process...');
        process.exit(0);
    }
    requestBody.token = conf.apiKey;
}

function processRequestAction(requestBody, pluginAction) {
    if (!pluginAction) {
        console.log('#### No plugin action is specified, defaulting to UPDATE action. To change action please refer to the documentation.');
        requestBody.type = 'UPDATE';
    } else {
        requestBody.type = pluginAction;
    }
}

function processProductToken(requestBody, conf) {
    // validate and add product token
    if (conf.productToken) {
        if (conf.productToken.length !== 36) {
            console.log('Product token should be 36 characters long, token will be ignored.');
        } else {
            requestBody.productToken = conf.productToken;
        }
    }

    // if valid token and product name then ignore product name otherwise use it
    if ((conf.productToken && conf.productToken.length === 36) && conf.productName) {
        console.log('Can\'t use both product token and product name in configuration, product name will be ignored.');
    } else {
        if (conf.productName) {
            requestBody.product = conf.productName;
            if (conf.productVersion) {
                requestBody.productVersion = conf.productVersion;
            }
        }
    }
}