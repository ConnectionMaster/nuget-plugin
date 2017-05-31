/**
 * Created by Yossi.Weinberg on 01/05/2017.
 */

var Utilities = exports;
exports.constructor = function Utilities() {};

var fs = require('fs'),
    path = require('path'),
    checksum = require('checksum'),
    download = require('download'),
    request = require('request'),
    parseString = require('xml2js').parseString,
    rimraf = require('rimraf'),
    dateFormat = require('dateformat'),
    winston = require('winston');

var logger = null;

/**
 * Create logger or return if already initialized
 * @returns winston logger object
 */
Utilities.getLogger = function () {
    var loggerFormat = function() {
        var now = Date.now();
        return dateFormat(now, 'isoDateTime');
    };

    var loggerFilenameDate = dateFormat(Date.now(), 'd-m-yy');

    if (logger === null) {
        logger = new winston.Logger({
            transports: [
                new winston.transports.Console({
                    timestamp: loggerFormat,
                    level: 'info' // min log level to show - as defined by npm logging levels (see https://github.com/winstonjs/winston)
                }),
                new (winston.transports.File)({
                    timestamp: loggerFormat,
                    filename: '.\\ws-nuget_' + loggerFilenameDate + '.log',
                    level: 'debug'
                })
            ]
        });
        logger.cli();
    }
    return logger;
};

Utilities.mkdir = function (fullPath) {
    if (!fs.existsSync(fullPath)) {
        try {
            fs.mkdirSync(fullPath);
            logger.debug('Created directory ' + fullPath);
        } catch (e) {
            logger.error('Unable to create folder in path: ' + fullPath + '.\n' + e + '\nExiting process...');
            process.exit(0);
        }
    }
};

Utilities.rm = function (path) {
    var rmOptions = {"disableGlob" : true};
    rimraf(path, rmOptions, function (err) {
        if (err) {
            logger.warn('Unable to delete folder ' + path + '\n' + err);
        }
        else {
            logger.debug('Remove folder ' + path);
        }
    });
};

Utilities.calculateSha1 = function (file, callback) {
    checksum.file(file, function (err, sha1) {
        if (err) {
            logger.verbose('Unable to calculate sha1 for ' + file + '\n' + err);
        } else {
            logger.verbose('file ' + file + ' sha1: ' + sha1);
            callback(sha1);
        }
    })
};

Utilities.downloadFile = function (url, filename, destination, callback) {
    var fullFilePath = destination + path.sep + filename;
    download(url).then(function (data) {
            fs.writeFileSync(fullFilePath, data);
            if (fs.statSync(fullFilePath).isFile()) {
                callback(null, url, filename, fullFilePath);
            }
        },
        function (err) {
            callback(err, url, filename);
        });
};

Utilities.loadJsonFile = function (path) {
    var file = fs.readFileSync(path);
    return JSON.parse(file);
};

Utilities.xmlToJson = function(path, callback) {
    var xmlFile = fs.readFileSync(path, 'utf8');
    parseString(xmlFile, callback);
};

Utilities.postRequest = function (url, type, requestBody, requestAgent, onSuccess) {
    var options = {
        url : url,
        timeout : 300000,
        agent: requestAgent,
        headers : { 'Charset': 'UTF-8',
                    'Content-Type': 'application/x-www-form-urlencoded'}
    };
    if (type === 'POST') {
        options.method = 'post';
        options.body = requestBody;
    } else if (type === 'GET') {
        options.method = 'get';
    }

    logger.debug('Request options: ' + JSON.stringify(options));

    request(options, function (err, entireResponse, responseBody) {
        logger.debug('Http entire response: ' + JSON.stringify(entireResponse));
        if (err) {
            logger.error('Http request failed.\n' + err);
        }
        if (entireResponse) {
            var statusCode = entireResponse.statusCode;
            if ((statusCode >= 200 && statusCode < 300) || statusCode === 304) {
                if (onSuccess) {
                    onSuccess(responseBody);
                }
            } else {
                logger.error('Http request failed with statues code: ' + statusCode)
            }
        }
    });
};