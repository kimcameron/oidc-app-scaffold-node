var pk = {
	path: require('path'),
	fs: require('fs')
};

const MAXREGISTERATTEMPTS = 5;
var app_config; 

module.exports = {
	pk: pk,
	init: init,
	corsOptions: corsOptions,
	createParameterString: createParameterString,
	jsonHttpData: jsonHttpData,
	landingPageError: landingPageError
}

async function init(client){
	pk.scaffold = this;
	var config = readConfig(client);
	pk.express = require('express');
	pk.app = pk.express();

	// configurations
	const cookieParser = require('cookie-parser');
	const bodyParser = require('body-parser');
	const exphbs = require('express-handlebars');

	pk.app.engine('handlebars', exphbs({defaultLayout: 'main'}));
	pk.app.set('view engine', 'handlebars');

	// Body Parser Middleware
	pk.app.use(bodyParser.json({limit: "1mb"}));
	pk.app.use(bodyParser.urlencoded({limit: "10mb", extended: false }));
	pk.app.use(cookieParser());

	pk.app.use('/web', pk.express.static('web'));

	pk.https = require('https');
	pk.http = require('http');
	pk.url_module = require('url');
	pk.querystring = require('querystring');
	pk.cors = require('cors');
	pk.base64url = require('base64url');
	pk.request = require('request');
	pk.nodeInput = require('./src/nodeInput');
	pk.postInstall = require('./src/postInstall');
	pk.util = {};

	var oidc_app_path = '../../' + client;
	console.log('oidc_app_path', oidc_app_path);
	pk.oidc_app = require(oidc_app_path);

	var client_api_url = config.client_api_url;
	if (!client_api_url){
		pk.log.error("client_api not started because oidc_config.json does not define client_api_url.")
		return;
	}

	// load full configuration from the client_api	
	var httpOptions = {
		url: client_api_url + '/app_config/' + client,
		method: 'GET',
	    headers: [ { name: 'Accept', value: 'application/json' } ],
	    parseJsonResponse: true
	};
	app_config = await jsonHttpData(httpOptions);

	pk.oidc_app.registerEndpoints(pk, app_config);

	if (config.httpsServerUrl !== undefined){
		var keyPath = pk.path.join(process.cwd(), 'oidc_lib_data/keys', config.https_certificate_filename);
		var credentials = {
		  key: pk.fs.readFileSync(keyPath + '.key'),
		  cert: pk.fs.readFileSync(keyPath + '.cer')
		};

		httpsServer = pk.https.createServer(credentials, pk.app);

		httpsServer.on('error', (e) => {
		  if (e.code === 'EADDRINUSE') {
			console.log('Address in use, retrying...');
			setTimeout(() => {
			  httpsServer.close();
			  httpsServer.listen(config.port);
			}, 1000);
		  }
		  else {
			console.log('Server listener error: ' + e.code);
			console.log('Details', e);		  	
		  }
		});

		httpsServer.listen(config.port, function(){
			console.log('Https server started at ' + config.httpsServerUrl);
		});	
	}
}


// these functions are copied from util_functions

function corsOptions(){
	var corsOptions = { 
		origin: function (origin, callback) {
			var whitelist = [];
    		if (whitelist.indexOf(origin) === -1) {
      			callback(null, true)
    		} 
    		else {
      			callback(new Error('Not allowed by CORS'))
    		}
  		}
	}

	return pk.cors(corsOptions);
}

function createParameterString(obj, encode){
	var handleEncode;
	if (encode === false){
		handleEncode = function(input){
			return input;
		}
	}
	else{
		handleEncode = encodeURIComponent;		
	}

	var result = '';
	var separator = '?';
	for (var key in obj){
		var value = obj[key] ? handleEncode(obj[key]) : '';
		result += separator + handleEncode(key) + '=' + value;
		separator = '&';
	}

	return result;
}

async function jsonHttpData(options){
	return new Promise((resolve, reject) => {
		if (typeof window === 'undefined'){
			// url
			var rOptions = {
				url: options.url
			};
			// method
			var method = options.method;
			if (method === undefined){
				method = 'GET';
			}
			rOptions.method = method.toUpperCase();
			// headers
			if (options.headers !== undefined){
				var headers = {};
				for (var i=0; i < options.headers.length; i++){
					var header = options.headers[i];
					headers[header.name] = header.value;
				}
				rOptions.headers = headers;
			}

			var postData = options.postData;
			if (postData){
				if (typeof postData !== 'string'){
					postData = JSON.stringify(postData);
				}
				rOptions.body = postData;
			}

			var request = pk.request;
			request(rOptions, function (error, response, body) {
				if (error || !body){
					reject(error);
					return;
				}
				if (options.parseJsonResponse){
					body = JSON.parse(body);
				}
				resolve(body);
			});
		}
		else{
			var xhr = new XMLHttpRequest();
			var method = options.method;
			if (method === undefined){
				method = 'GET';
			}
			xhr.open(method, options.url, true);

			var authorizationHeaderPresent = false;
			if (options.headers !== undefined){
				for (var i=0; i < options.headers.length; i++){
					var header = options.headers[i];
					if (header.name === 'Authorization'){
						authorizationHeaderPresent = true;
					}
					xhr.setRequestHeader(header.name, header.value);
				}
			}

			xhr.onreadystatechange = function () {
			    if (xhr.readyState === 4){
			    	if (xhr.status === 200) {
			    		var result = xhr.responseText;
						if (options.parseJsonResponse){
							result = JSON.parse(result);
						}
				        resolve(result);
				    }
				    else {
					    reject(xhr.responseText);
				    }
			    }
			};

			if (authorizationHeaderPresent){
				xhr.withCredentials = true;
			}

			if (method.toUpperCase() === 'GET' || options.postData === undefined){
				xhr.send();
			}
			else{
				var postData = options.postData;
				if (typeof postData !== 'string'){
					postData = JSON.stringify(postData);
				}
				xhr.send(postData);		 			
			}
		}
	});
}

async function landingPageError(params, res, viewPath, applicationUrl){
	res.render(viewPath + '/error', {
    	layout: 'main_responsive',
    	credentialType: app_config.credential_type,
    	statusCode: params.statusCode,
    	error: params.error,
    	error_description: params.error_description,
    	applicationUrl: applicationUrl
    });			

}

function readConfig(client){
	var config_path = pk.path.join(process.cwd(), 'oidc_config.json');
	var possible_error = 'Unable to open ' + config_path;
	try{
		var config_string = pk.fs.readFileSync(config_path, 'utf-8');
		possible_error = 'Unable to parse oidc_config.json';
		var config = JSON.parse(config_string).config;
	}
	catch(err){
		throw (possible_error + ': ' + err);
	}

	// the config definition is itself in a config property of the obj

	config.httpsServerUrl = config.hostname + ':' + config.port;
	config.httpsServerUrlHref = config.httpsServerUrl + '/';
	config.applicationPath = '/' + client;	
	config.applicationUrl = config.httpsServerUrlHref + client;

	return (config);
}
