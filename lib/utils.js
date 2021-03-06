const os = require('os');
const fs = require('fs');
const net = require('net');
const child_process = require('child_process');
const toString = Object.prototype.toString;
const fetch = require("node-fetch");

const utils = {
	get platform(){
		let platform = os.platform();
		platform = ({ 'win32' : 'windows' }[platform]) || platform;
		let arch = os.arch();
		return `${platform}-${arch}`;
	}
};

utils.isNw = typeof nw != 'undefined' && typeof nw.App != 'undefined';
utils.toString = toString;
const is = utils.is = (obj, type) => {return toString.call(obj) == '[object '+type+']'}
utils.isArray = (obj) => {return Array.isArray(obj);/*return is(obj, 'Array')*/}
utils.isObject = (obj) => {return is(obj, 'Object')}
utils.isString = (obj) => {return is(obj, 'String')}
utils.isNumber = (obj) => {return is(obj, 'Number')}
utils.isUndefined = (obj) => {return is(obj, 'Undefined')}

utils.spawn = (file, args, options = {}, ready) => {
	return new Promise((resolve, reject) => {

		if(!options)
			options = { }

		const { env } = process;

		let proc = child_process.spawn(file,args,Object.assign({ env }, options));
		let done = false;

		const filter = typeof options.stdout == 'function';
		proc.stdout?.on?.('data', (data) => {
			if(filter)
				data = options.stdout(data);
			if(data)
				process.stdout.write(data);
		});

		proc.stderr?.on?.('data', (data) => {
			if(filter)
				data = options.stdout(data);
			if(data)
				process.stderr.write(data);
		});

		proc.on('close', (code) => {
			if(!done) {
				resolve(code);
				done = true;
			}
		})

		proc.on('error', (err) => {
			if(!done) {
				done = true;
				reject(err);
			}
		})

		if(typeof ready == 'function')
			ready(proc);
	})
}

utils.match = (text, regexp) => {
	return ((text && text.match(regexp) || {}).groups || {});
}

utils.each = (obj, iteratee)=>{

    if(utils.isObject(obj)){
        let keys = Object.keys(obj);
        for (let i = 0, length = keys.length; i < length; i++) {
            iteratee(obj[keys[i]], keys[i], obj);
        }
        return
    }
    if(typeof obj.forEach == 'function'){
        obj.forEach(iteratee);
        return
    }

    let length = obj && obj.length;
    if(typeof length == 'number'){
        for (let i = 0; i < length; i++) {
            iteratee(obj[i], i, obj);
        }
        return;
    }

    return false;
}

utils.args = (args) => {
	args = args || process.argv.slice(2);

	let argsRegex = null;
	try {
		argsRegex = new RegExp('^--(?<prop>[\\w-]+)(=(?<value>.+))?$');
	} catch(ex) { /*console.log(ex);*/ }

	let o = { }

	if(!argsRegex) {

		args.forEach((arg)=>{
			arg = arg.split('=');
			let k = arg.shift();
			let v = arg.shift();
			k = k.replace(/^--/,'');
			if(v !== undefined) o[k] = v; else o[k] = true;
		});

		return o;
	}

	args.map((arg) => {
		const { prop, value } = utils.match(arg,argsRegex);

		if(value == undefined)
			o[prop] = true;
		else
		if(o[prop]) {
			if(Array.isArray(o[prop]))
				o[prop].push(value);
			else
				o[prop] = [o[prop], value];
		}
		else {
			o[prop] = value;
		}
	})
	return o;
}

utils.fetchJSON = (...args) => {
	return new Promise((resolve, reject) => {
		fetch(...args).then(res=>{
			res.json().then(json=>{
				resolve(json);
			}).catch(e=>{
				resolve({error:"JSON Parse error", JSONError:e, res})
			})
		}).catch(e=>{
			resolve({error:"URL fetch error", URLError:e})
		})
	})
}

if(!Number.prototype.toFileSize) {
	Object.defineProperty(Number.prototype, 'toFileSize', {
		value: function(a, asNumber){
			let b,c,d;
			let r = (
				a=a?[1e3,'k','B']:[1024,'K','iB'],
				b=Math,
				c=b.log,
				d=c(this)/c(a[0])|0,this/b.pow(a[0],d)
			).toFixed(2)

			if(!asNumber)
				r += ' '+(d?(a[1]+'MGTPEZY')[--d]+a[2]:'Bytes');
			return r;
		},
		writable:false,
		enumerable:false
	});
}

if(!Number.prototype.toCS) {
	Object.defineProperty(Number.prototype, 'toCS', {
	   value: function(p, tz){
			let precision = p || 0;
			let f = (this).toFixed(precision).split('.');
			f[0] = f[0].toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
			let t = f.join('.');
			if(!tz || !~t.indexOf('.'))
				return t;
			while(t.length > 2 && t[t.length-1] == 0 && t[t.length-2] != '.')
				t = t.substring(0, t.length-1);
			return t;
		},
		writable:false,
		enumerable:false
	});
}

utils.mergeObjects = (dst, ...src_)=>{
    src_.forEach((src)=>{
        Object.entries(src).forEach(([k,v])=>{
            if(Array.isArray(v)){
                dst[k] = [];
                utils.mergeObjects(dst[k], v);
            }else if(utils.isObject(v)) {
                if(!dst[k] || utils.isString(dst[k]) || !utils.isObject(dst[k]))
                    dst[k] = { };
                utils.mergeObjects(dst[k], v);
            }else{
                if(Array.isArray(src))
                    dst.push(v);
                else
                    dst[k] = v;
            }
        })
    })
    return dst;
}


utils.readJSON = (filename) => {

	try {
		if(!fs.existsSync(filename))
			return null;
		return JSON.parse(fs.readFileSync(filename,{encoding:'utf8'}));
	} catch(ex) {
		console.trace('readJSON error:',ex);
		return null;
	}
}

utils.getConfig = function(name, defaults = null) {
	let data = [ ];
	name = name.replace(/\.conf$/i,'');
    [`${name}.conf`, `${name}.${os.hostname()}.conf`, `${name}.local.conf`].forEach((filename) => {
        if(fs.existsSync(filename)) 
            data.push(fs.readFileSync(filename) || null);
    })

    if(!data[0] && !data[1]) {
        return defaults;
    }

    let o = defaults || { }
    data.forEach((conf) => {
        if(!conf || !conf.toString('utf-8').length)
            return;
        let layer = eval('('+conf.toString('utf-8')+')');
        utils.mergeObjects(o, layer);
    })

    return o;
}

utils.watchConfig = (filename, fn) => {
    let first = true;
    const update = () => {
        try {
            let v = utils.getConfig(filename);
            fn(v, first);
            first = false;
        } catch(ex) { console.log(ex); }
    }
    fs.watch(filename, update);
    update();
}


utils.isPortReachable = async (port, host = "localhost", timeout = 1000) => {
	return new Promise(((resolve, reject) => {
		const socket = new net.Socket();

		const onError = () => {
			socket.destroy();
			resolve(false);
		};

		socket.setTimeout(timeout);
		socket.once('error', onError);
		socket.once('timeout', onError);

		socket.connect(port, host, () => {
			socket.end();
			resolve(true);
		});
	}));
};


utils.waitForPort = (port, host) => {
	return new Promise((resolve,reject) => {
		const connect = () => {
			utils.isPortReachable(port, { host }).then((isOpen) => {
				if(isOpen)
					return resolve();
				else
					dpc(connect);
			});
		}

		connect();
	})
}


utils.getTS = (src_date) => {
    var d = src_date || (new Date());
    var year = d.getFullYear();
    var month = d.getMonth()+1; month = month < 10 ? '0' + month : month;
    var date = d.getDate(); date = date < 10 ? '0' + date : date;
    var hour = d.getHours(); hour = hour < 10 ? '0' + hour : hour;
    var min = d.getMinutes(); min = min < 10 ? '0' + min : min;
    var sec = d.getSeconds(); sec = sec < 10 ? '0' + sec : sec;
    //var time = year + '-' + month + '-' + date + ' ' + hour + ':' + min + ':' + sec;
    return `${year}-${month}-${date} ${hour}:${min}:${sec}`;
}

utils.logger = (cname, options = { }) => {
	if(utils.isNw && !options.timestamps) {
		return Function.prototype.bind.call(
			console.log,
			console,
			`%c[${cname}]`,
			`font-weight:bold;`
		)
	} else {
		return Function.prototype.bind.call(
			console.log,
			console,
			utils.getTS(),
			cname,
			// `%c[${cname}]`,
			// `font-weight:bold;`
		)
	}
}

utils.shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
utils.fetch = (url, opt)=>{
	let {qs, data, method="GET", args={}} = opt;
	if(qs){
		let _url = new URL(url);
		Object.entries(qs).forEach(([k, v])=>{
			_url.searchParams.set(k, v)
		});
		url = _url.toString();
	}
	let {headers={}} = args;
	if(data && !headers['Content-Type']){
		headers['Content-Type'] = 'application/json';
		if(!utils.isString(data))
			data = JSON.stringify(data);
	}

	args.data = data;
	args.headers = headers;
	return fetch(url, args);
}

utils.validateCaptcha = (args, callback)=>{
	return new Promise((resolve)=>{
		let {req, captcha, secret, captchaSecret, core, data={}} = args;
		captcha 	= captcha || data['g-recaptcha-response'];
		secret 		= secret || captchaSecret || core?.config?.captcha?.secret;
		if(!captcha || !captcha.length){
			resolve({
				error:{
					error : "Captcha validation failure",
					type : "captcha", "error-codes" : ['invalid-input-response']
				},
				result:{
					success : false
				}
			});
			return
		}

		utils.fetch("https://www.google.com/recaptcha/api/siteverify",{
			method: 'GET',
			qs: {
				secret,
				response: captcha
			}
		})
		.then(response=>{
			console.log("response", response)
			return response.json();
		})
		.then(data=>{
			if(data.success)
				return resolve({result:data});
			//console.log("Captcha responce", err, response, data);
			let errors = data['error-codes'];
			errors && console.log("errors",errors);

			let error = data.error || '';
			if (errors && errors.length) {
				if (errors.includes('invalid-input-response'))
					error = (req && req._T) ? req._T("Please complete captcha") : "Please complete captcha";
				else
					error = errors.join('/');
			}

			return resolve({
				error:{
					error:error||"Captcha validation failure"
				},
				result: data
			});
		});
	})
}


module.exports = utils;
