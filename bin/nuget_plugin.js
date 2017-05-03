/**
 * Created by Yossi on 4/28/2017.
 */

// get and parse wss conf
// delete tmp folder
// create request and send to server
// get response from server and produce response to user

var format = require('string-format'),
osTmpdir = require('os-tmpdir'),
path = require('path'),
fs = require('fs'),
queryString = require('querystring');
parseString = require('xml2js').parseString;

var Utilities = require('./utilities');

main();
// var dependencies = [];

function main() {
    var tmpFolderPath = osTmpdir() + path.sep + 'Ws-nuget-temp';

    console.log(tmpFolderPath);
    Utilities.mkdir(tmpFolderPath);
    var xmlFile = fs.readFileSync('C:\\Users\\Yossi\\Desktop\\nugetPackages\\Inloggning Web\\packages.Skandia.Login.Web.Mvc.config','utf8');
    parseString(xmlFile, function (err, result) {
        if (err) {
            console.log(err);
        } else {
            var nugetPackages = result.packages.package;
            var asyncDownloadCounter = nugetPackages.length;
            var dependencies = [];
            for (var i = 0; i < nugetPackages.length; i++) {
                var pkg = nugetPackages[i]['$']; // todo check if exist (all sub members as well)
                var nugetGav = createDependencyInfoWithNoSha1(pkg.id.toLowerCase(), pkg.version.toLowerCase());
                dependencies.push(nugetGav);


                // create download link
                // var repositoryUrlPattern = 'https://api.nuget.org/v3-flatcontainer/{0}/{1}/{0}.{1}.nupkg';
                // var downloadUrl = format(repositoryUrlPattern, pkg.id.toLowerCase(), pkg.version.toLowerCase());
                // var filename = downloadUrl.substring(downloadUrl.lastIndexOf('/') + 1);

                // Utilities.downloadFile(downloadUrl, filename, tmpFolderPath, function (err, name, file) {
                //     if (err) {
                //         if (err.statusCode === 404) {
                //             console.log('Unable to find ' + name + ' in the public nuget repository');
                //             // console.log(err);
                //         } else {
                //             console.log('Error downloading ' + name + ' with error code ' + err.statusCode);
                //             // console.log(err);
                //         }
                //     } else {
                //         createDependencyInfo(file, name);
                //     }
                //     if (--asyncDownloadCounter === 0) {
                //         Utilities.rm(tmpFolderPath);
                //         sendRequestToServer(dependencies);
                //     }
                // });
            }
            sendRequestToServer(dependencies);
        }
    });
}

function sendRequestToServer(dependencies) {
    var requestBody = [{
        'coordinates' : {
            'artifactId' : 'testProj'
        },
        'dependencies' : dependencies
    }];

    var entireRequest = {
        'agent' : 'nuget-plugin',
        'agentVersion' : '1.0',
        'type': 'UPDATE',
        'token': 'deb6c29f-1690-4173-b7ce-31ce09fa5676',
        'timeStamp': new Date().getTime()
    };

    var requestBodyStringafied = queryString.stringify(entireRequest);
    requestBodyStringafied += "&diff=" + JSON.stringify(requestBody);
    Utilities.postRequest('http://localhost:8081/agent', 'POST', requestBodyStringafied, function (responseBody) {
        console.log(responseBody);
    }, function (err) {
        console.log(err);
    })
}

function createDependencyInfo(file) {
   Utilities.calculateSha1(file, function (sha1) {
       dependencies.push({
           'artifactId' : file,
           'sha1' : sha1
       });
   });

}

function createDependencyInfoWithNoSha1(pkgId, pkgVersion) {
    return {
        'groupId' : pkgId ,
        'artifactId' : pkgId ,
        'version' : pkgVersion
    }
}