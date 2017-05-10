/**
 * Created by Yossi.Weinberg on 5/5/2017.
 */

var CmdArgs = exports;
exports.constructor = function CmdArg(){};

var commandLineArgs = require('command-line-args'),
    path = require('path'),
    fs = require('fs'),
    utilities = require('./utilities');

const cmdArgsDefinitions = [
    {name: 'ws_config', alias: 'c', type: String},
    {name: 'nuget_config', alias: 'n', type: String},
    {name: 'action', alias: 'a', type: String },
    {name: 'debug', alias: 'd', type: Boolean }
];

var logger = utilities.getLogger();
try {
    var cmd = commandLineArgs(cmdArgsDefinitions); // load the actual cmd line arguments
} catch (err) {
    logger.error('Unable to load cmd arguments ' + err + '\nExiting...');
    process.exit(0);
}

/**
 * Parse and validate cmd args
 * @returns object with all args
 */
CmdArgs.getCmdArgs = function () {
    validateCmdArgs();
    logger.debug('Cmd params after validation: ' + JSON.stringify(cmd));
    return cmd;
};

function validateCmdArgs() {
    if (cmd.debug) {
        logger.transports.file.level = 'debug';
    }

    if (cmd.action) {
        var upperCaseAction = cmd.action.toUpperCase();
        if (upperCaseAction === 'UPDATE' || upperCaseAction === 'CHECK_POLICIES' || upperCaseAction === 'CHECK_POLICY_COMPLIANCE') {
            cmd.action = upperCaseAction;
        } else {
            logger.warn('Action ' + cmd.action + ' is not supported. Please refer to the documentation for supported action types. Using UPDATE default action.');
            cmd.action = 'UPDATE';
        }
    } else {
        logger.warn('No plugin action was specified as a cmd argument, using UPDATE default action.');
        cmd.action = 'UPDATE';
    }

    if (cmd.nuget_config) {
        if (!fs.existsSync(cmd.nuget_config)) {
            logger.error('Nuget packaging configuration file ' + cmd.nuget_config + ' doesn\'t exist. Exiting...')
            // process.exit(0); //todo uncomment in production
        }
    } else {
        logger.error("Nuget packaging configuration path is not specified. Exiting...");
        // process.exit(0); //todo uncomment in production
    }

    if (!cmd.ws_config) {
        if (fs.existsSync('.\\config.json')) {
            logger.debug('Nuget plugin configuration path is found in working directory.');
            cmd.ws_config = '.\\config.json';
        } else {
            logger.error('Ws Nuget plugin configuration file doesn\'t exits in working directory' + cmd.ws_config + ' please specify a valid path. Exiting...');
            process.exit(0);
        }
    } else {
        if (!fs.existsSync(cmd.ws_config)) {
            logger.error('Ws Nuget plugin configuration file doesn\'t exits in ' + cmd.ws_config + ' please specify a valid path. Exiting...');
            process.exit(0);
        }
    }
}