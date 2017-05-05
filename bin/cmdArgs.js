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
    {name: 'action', alias: 'a', type: String }
];

var logger = utilities.getLogger();
var cmd = commandLineArgs(cmdArgsDefinitions); // load the actual cmd line arguments

CmdArgs.getCmdArgs = function () {
    validateCmdArgs();
    return cmd;
};

function validateCmdArgs() {
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
            logger.info('Nuget packaging configuration file ' + cmd.nuget_config + ' doesn\'t exist. Exiting...')
            // process.exit(0); //todo uncomment in production
        }
    } else {
        logger.error("Nuget packaging configuration path is not specified. Exiting...");
        // process.exit(0); //todo uncomment in production
    }

    if (!cmd.ws_config) {
        logger.warn('Ws Nuget plugin configuration path is not specified. Searching configuration file in working directory.');
        if (fs.existsSync('.')) { //todo check if working with relative paths
            cmd.ws_config = '.';
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