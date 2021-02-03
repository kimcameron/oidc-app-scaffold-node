var pk = {
	path: require('path'),
	fs: require('fs')
};

const MAXREGISTERATTEMPTS = 5;
var cachedInitParams;
var ac; 

module.exports = {
	pk: pk,
	init: init,
	corsOptions: corsOptions,
	createParameterString: createParameterString,
	jsonHttpData: jsonHttpData,
	registerApi: registerApi,
	validateRequestConfig: validateRequestConfig,
	landingPageError: landingPageError
}

function init(){
	pk.scaffold = this;
	ac = readConfig();
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

	var oidc_app_path = '../../' + ac.client;
	console.log('oidc_app_path', oidc_app_path);
	pk.oidc_app = require(oidc_app_path);

	pk.oidc_app.registerEndpoints(pk, ac);

	if (ac.httpsServerUrl !== undefined){
		var keyPath = pk.path.join(process.cwd(), 'oidc_lib_data/keys', ac.https_certificate_filename);
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
			  httpsServer.listen(ac.port);
			}, 1000);
		  }
		  else {
			console.log('Server listener error: ' + e.code);
			console.log('Details', e);		  	
		  }
		});

		httpsServer.listen(ac.port, function(){
			console.log('Https server started at ' + ac.httpsServerUrl);
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
				        resolve(xhr.responseText);
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

/*
async function registerApi(initParams){
	return new Promise((resolve, reject) => {
		if (!cachedInitParams){
			cachedInitParams = initParams;
		}

		var url = ac.client_api_url + '/register/' + initParams.client_name
			+ createParameterString(initParams, false);

		var httpOptions = {
			url: url,
			method: 'GET',
		    headers: [ { name: 'Accept', value: 'application/json' } ]
		};

		var sessionKey;
		var registerCount = 0; 
		setTimeout(await attemptRegister, 5000, registerCount, returnResult); 

		function returnResult(result){
			if (result.sessionKey){
				resolve(result.sessionKey);
			}
			else{
				reject(result.error);
			}
		}
	});

	async function attemptRegister(registerCount, callback){
        registerCount++; 
		try {
			sessionKey = await jsonHttpData(httpOptions);
			callback({sessionKey: sessionKey});
		}
		catch(err){
			if (registerCount === MAXREGISTERATTEMPTS){
				callback({error: 'Registration failed after ' + registerCount + ' attempts.'})
           	}

           	pk.util.log_debug('Register attempt failed.  Scheduling attempt ' + registerCount);
			setTimeout(await attemptRegister, 5000, registerCount, callback); 
		}
	}
}
*/

async function registerApi(initParams){
	var url = ac.client_api_url + '/register/' + initParams.client_name
		+ createParameterString(initParams, false);

	var httpOptions = {
		url: url,
		method: 'GET',
	    headers: [ { name: 'Accept', value: 'application/json' } ]
	};

	var sessionKey = await jsonHttpData(httpOptions);
	console.log('Session Key: ', sessionKey);
	return sessionKey;
}

function validateRequestConfig(request_config){
	if (!request_config.credential_type.startsWith(ac.smart_credential_prefix)){
		console.log();
		console.log('WARNING: request_config credential_type (' + request_config.credential_type + ')');
		console.log('  is different from configured smart_credential_prefix (' + api_config.smart_credential_prefix + ')');
		console.log()
	}
}

async function landingPageError(params, res, viewPath, applicationUrl){
	var api_config = JSON.parse(decodeURIComponent(cachedInitParams.api_config));

	if (params.statusCode === "400" && params.error === "registration_required"){
		await registerApi(cachedInitParams);
	}

	res.render(viewPath + '/error', {
    	layout: 'main_responsive',
    	credentialType: api_config.credential_type,
    	statusCode: params.statusCode,
    	error: params.error,
    	error_description: params.error_description,
    	applicationUrl: applicationUrl
    });			

}

function readConfig(){
	var config_path = pk.path.join(process.cwd(), 'oidc_config.js');
	try{
		var config_string = pk.fs.readFileSync(config_path, 'utf-8');
	}
	catch(err){
		throw ('oidc_config is required: ' + config_path);
	}

	// the config definition is itself in a config property of the obj
	var config = JSON.parse(config_string).config;

	config.httpsServerUrl = config.hostname + ':' + config.port;
	config.httpsServerUrlHref = config.httpsServerUrl + '/';
	config.applicationPath = '/' + config.client;	
	config.applicationUrl = config.httpsServerUrlHref + config.client;

	// used tp register with API provider
	config.request_config = {
		"client": config.client,
		"company_name": config.company_name,
		"credential_image": config.company_logo,
		"instructions": config.instructions,
		"credential_type": config.credential_type,
		"credential_reason": config.credential_reason,
		"scope": "openid"
	}


	return (config);
}
