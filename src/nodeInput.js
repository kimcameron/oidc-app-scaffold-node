module.exports = function(){
	const readline = require('readline');
	readline.emitKeypressEvents(process.stdin);
	var _keyPressHandler = _noopHandler;
	var _input = [];
	var _resolve;
	var _reject;
	process.stdin.on('keypress', (str, key) => {
		if (key.ctrl === true && key.name === 'c'){
			process.stdin.setRawMode(false);
			process.exit();
		}
		_keyPressHandler(str, key);
	});

	function _noopHandler(){};

	function _defaultHandler(str, key){
		switch (key.name){
			case '\b':
				_input.pop();
				break;
			case 'enter':
				var line = '';
				for (var i=0; i < _input.length; i++){
					line += _input[i];
				}

				_keyPressHandler = _noopHandler;
				process.stdin.setRawMode(false);
				_resolve(line);
				break;
			default:
				_input.push(key.sequence);
		}
	}

	function _trueFalseHandler(str, key){
		str = str.toUpperCase();
		if (str === 'Y' || str === 'N'){
			process.stdin.setRawMode(false);
			_resolve(str === 'Y');
		}
		else if (key.ctrl === true && key.name === 'c'){
			process.stdin.setRawMode(false);
			process.exit();
		}
	}

	Object.defineProperty(this, "question", {
	    value: function(whatToAsk, handler) {
	    	if (handler === undefined){
	    		handler = 'default';
	    	}

    		switch (handler){
    			case 'trueFalse':
					process.stdin.setRawMode(true);
    				_keyPressHandler = _trueFalseHandler;
		    		console.log(whatToAsk + ' (Y/N) ');
    				break;
    			case 'default':
    				_inputCount = 0;
    				_input = [];
					process.stdin.setRawMode(false);
    				_keyPressHandler = _defaultHandler;
		    		console.log(whatToAsk);
    				break;
    			default:
    				throw 'Invalid handler value: ' + handler;
    		}

    		return new Promise((resolve, reject) => {
    			_resolve = resolve;
    			_reject = reject;

    		});
	    },
	    enumerable: true
	 });
}