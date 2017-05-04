/**
 * Created by Yossi.Weinberg on 01/05/2017.
 */

// todo check what this is for
var Utilities = exports;
exports.constructor = function Utilities() {};

var fs = require('fs'),
    path = require('path'),
    checksum = require('checksum'),
    download = require('download'),
    request = require('request'),
    parseString = require('xml2js').parseString,
    rimraf = require('rimraf'),
    loadJsonFile = require('load-json-file');


Utilities.mkdir = function (fullPath) {
    if (!fs.existsSync(fullPath)) {
        try {
            fs.mkdirSync(fullPath);
        } catch (e) {
            console.log('Unable to create folder in path: ' + fullPath + '.\n' + e + '\nExiting process...');
            process.exit(0);
        }
    }
};

Utilities.rm = function (path) {
    var rmOptions = {"disableGlob" : true};
    rimraf(path, rmOptions, function (err) {
        if (err) {
            console.log('Unable to delete tmp folder ' + path + '\n' + err);
        }
    });
};

Utilities.calculateSha1 = function (file, callback) {
    checksum.file(file, function (err, sha1) {
        if (err) {
            console.log('Unable to calculate sha1 for ' + file + '\n' + err);
        } else {
            console.log('file ' + file + ' sha1: ' + sha1);
            callback(sha1);
        }
    })
};

Utilities.downloadFile = function (url, filename, destination, callback) {
    download(url).then(function (data) {
            var fullFilePath = destination + path.sep + filename;
            fs.writeFileSync(fullFilePath, data);
            if (fs.statSync(fullFilePath).isFile()) {
                callback(null, filename, fullFilePath);
            }
        },
        function (err) {
            callback(err, filename);
        });
};

Utilities.loadJsonFile = function (path) {
    return loadJsonFile.sync(path);
};

Utilities.xmlToJson = function(path, callback) {
    var xmlFile = fs.readFileSync(path, 'utf8');
    parseString(xmlFile, callback);
};

Utilities.postRequest = function (url, type, requestBody, onSuccess, onError) {
    var options = {
        url : url,
        timeout : 1800000,
        headers : { 'Charset': 'UTF-8',
                    'Content-Type': 'application/x-www-form-urlencoded'}
    };
    if (type === 'POST') {
        options.method = 'post';
        options.body = requestBody;
    } else if (type === 'GET') {
        options.method = 'get';
    }

    request(options, function (err, entireResponse, responseBody) {
        if (err && onError) {
            onError(err, requestBody, entireResponse);
        }
        if (entireResponse) {
            var statusCode = entireResponse.statusCode;
            if ((statusCode >= 200 && statusCode < 300) || statusCode === 304) {
                if (onSuccess) {
                    onSuccess(responseBody);
                }
            } else {
                onError('Unable to send request') // todo update msg
            }
        }
    });
};