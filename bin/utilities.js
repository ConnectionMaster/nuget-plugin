/**
 * Created by Yossi.Weinberg on 01/05/2017.
 */

var Utilities = exports;
exports.constructor = function Utilities() {
};

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
    var loggerFormat = function () {
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
    var rmOptions = {"disableGlob": true};
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
            sha1 = "";
            callback(sha1);
        } else {
            logger.verbose('file ' + file + ' sha1: ' + sha1);
            callback(sha1);
        }
    })
};

Utilities.downloadFile = function (url, filename, destination, privateRegistryUsername, privateRegistryPassword, callback) {
    var options = {};
    var emptyString = '';
    if (privateRegistryPassword !== null && privateRegistryPassword !== emptyString) {
        var userAndPassAuth = privateRegistryUsername + ":" + privateRegistryPassword;
        options = {
            headers: {
                Authorization: 'Basic  ' + new Buffer(userAndPassAuth).toString('base64')
            }
        };
    }
    var fullFilePath = destination + path.sep + filename;
    download(url, options).then(function (data) {
            if (data.toString().indexOf("<!DOCTYPE html") == -1) {
                fs.writeFileSync(fullFilePath, data);
                if (fs.statSync(fullFilePath).isFile()) {
                    callback(null, url, filename, fullFilePath);
                }
            } else { // the html page was downloaded and not the file (it occurs when wrong password was entered)
                var downloadFailed = true;
                callback(downloadFailed, url, filename);
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

Utilities.xmlToJson = function (path, callback) {
    var xmlFile = fs.readFileSync(path, 'utf8');
    parseString(xmlFile, callback);
};

Utilities.setSleepTimeOut = function(milSeconds)
{
    var e = new Date().getTime() + milSeconds;
    while (new Date().getTime() <= e) {}
}

Utilities.postRequest = function (url, type, requestBody, requestAgent, onSuccess, retryOnFailure, retries, retriesInterval) {

    var options = {
        url: url,
        timeout: 300000,
        agent: requestAgent,
        headers: {
            'Charset': 'UTF-8',
            'Content-Type': 'application/x-www-form-urlencoded'
        }
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
        if (entireResponse || retryOnFailure) {
            var statusCode = entireResponse? entireResponse.statusCode: 443;
            if ((statusCode >= 200 && statusCode < 300) || statusCode === 304) {
                if (onSuccess) {
                    onSuccess(responseBody);
                }
            } else {
                if(retryOnFailure === true) {
                    if(retries-- > -1) {
                        logger.error("Failed to send request to WhiteSource server");
                        logger.error("Trying " + (retries + 1) + " more time" + (retries != 0 ? "s" : ""));
                        Utilities.setSleepTimeOut(retriesInterval*1000);
                        Utilities.postRequest(url, type, requestBody, requestAgent, onSuccess, retryOnFailure, retries, retriesInterval);
                    }
                }
                else {
                    logger.error('Http request failed with statues code: ' + statusCode)
                }
            }
        }
    });
};

Utilities.removeDuplicatePrimitivesFromArray = function (array) {
    var uniqueArray = {};
    return array.filter(function (item) {
        return uniqueArray.hasOwnProperty(item) ? false : (uniqueArray[item] = true);
    });
};

Utilities.cleanJson = function (toClean) {
    return toClean.replace(/\\n/g, "\\n")
        .replace(/\\'/g, "\\'")
        .replace(/\\"/g, '\\"')
        .replace(/\\&/g, "\\&")
        .replace(/\\r/g, "\\r")
        .replace(/\\t/g, "\\t")
        .replace(/\\b/g, "\\b")
        .replace(/\\f/g, "\\f");
};