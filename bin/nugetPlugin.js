/**
 * Created by Yossi.Weinberg on 4/28/2017.
 */

var format = require('string-format'),
osTmpdir = require('os-tmpdir'),
path = require('path'),
fs = require('fs'),
queryString = require('querystring');

var Utilities = require('./utilities');
var confBuilder = require('./confBuilder');

var dependencies = [];
var agentProjectInfos = [];
var requestBody;
var tmpFolderPath = osTmpdir() + path.sep + 'Ws-nuget-temp';
var repositoryUrlPattern = 'https://api.nuget.org/v3-flatcontainer/{0}/{1}/{0}.{1}.nupkg';
var isFilterDevDependencies = false;

main();

function main() {
    var conf = Utilities.loadJsonFile('C:\\Yossi\\Plugins\\nuget\\config.json'); //todo deal with getting line from cmd
    requestBody = confBuilder.createPostRequestBody(conf, 'UPDATE'); // todo get action from cmd
    agentProjectInfos.push(confBuilder.processProjectIdentification(conf));

    Utilities.mkdir(tmpFolderPath);
    getLinksFromXmlConfigFile('C:\\Users\\Yossi\\Desktop\\nugetPackages\\Inloggning Web\\packages.Skandia.Login.Web.Mvc.config', onLinksAction);
}

function sendRequestToServer() {
    if (requestBody) {
        agentProjectInfos[0].dependencies = dependencies;
        var requestBodyStringified = queryString.stringify(requestBody);
        requestBodyStringified += "&diff=" + JSON.stringify(agentProjectInfos);
        Utilities.postRequest('http://localhost:8081/agent', 'POST', requestBodyStringified, function (responseBody) {
            console.log(responseBody);
        }, function (err) {
            console.log(err);
        })
    } else {
        // todo deal with error properly
        console.log("no request body ---- errrrrorrr "); //todo remove in production
    }
}

function createDependencyInfo(file) {
   Utilities.calculateSha1(file, function (sha1) {
       dependencies.push({
           'artifactId' : file.substring(file.lastIndexOf('/') + 1),
           'sha1' : sha1
       });
   });
}

// method to parse packageConfig.xml file
function getLinksFromXmlConfigFile(xmlPath, onAllLinks) {
    var downloadLinks = [];
    Utilities.xmlToJson(xmlPath, function (err, jsonConfig) {
        if (err) {
            console.log(err);
        } else {
            if (jsonConfig.packages) {

                if (jsonConfig.packages.package) {
                    var nugetPackages = jsonConfig.packages.package;
                    // var asyncDownloadCounter = nugetPackages.length;
                    for (var i = 0; i < nugetPackages.length; i++) {
                        if (nugetPackages[i]['$']) {
                            var pkg = nugetPackages[i]['$'];

                            if (pkg.developmentDependency && isFilterDevDependencies) {
                                continue;
                            }
                            var downloadUrl = format(repositoryUrlPattern, pkg.id.toLowerCase(), pkg.version.toLowerCase());
                            downloadLinks.push(downloadUrl);
                        }
                    }
                    onAllLinks(downloadLinks, tmpFolderPath);
                } else {

                }
            } else {

            }
        }
    });
}

function onLinksAction(downloadLinks, downloadDestination) {
    var asyncDownloadCounter = downloadLinks.length;
    for (var i =0; i < asyncDownloadCounter; i++) {
        var link = downloadLinks[i];
        var filename = link.substring(link.lastIndexOf('/') + 1);
        Utilities.downloadFile(link, filename, downloadDestination, function (err, name, file) {
            if (err) {
                if (err.statusCode === 404) {
                    console.log('Unable to find ' + name + ' in the public nuget repository');
                } else {
                    console.log('Error downloading ' + name + ' with error code ' + err.statusCode);
                }
            } else {
                createDependencyInfo(file);
            }

            if (--asyncDownloadCounter === 0) {
                Utilities.rm(tmpFolderPath);
                sendRequestToServer();
            }
        });
    }
}