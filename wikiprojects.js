(function() {

console.log("Wikiprojects.js run started at " + new Date());

//Set up parameters
try {
	var credentials = require('./credentials.js').credentials.enwiki;
} catch {
	console.error("Credentials file not found!");
	return;
} finally {
	if (!credentials) { 
		console.error("Credentials not found in credentials file!");
		return;
	}
}

var templateList = "Wikipedia:WikiProject Articles for creation/WikiProject templates.json";
var configFile = "Wikipedia:WikiProject Articles for creation/WikiProject templates.json/config.json";

//Define globals
require('jsdom-global')(undefined, {"url": credentials.wikiUrl});
require('mock-mediawiki');
var configObject, wikiProjectCategories, wikiprojects = {};
var apiUrl = credentials.wikiUrl+mw.util.wikiScript('api');
var api = new mw.Api({ ajax: { url: apiUrl} });

//Log in
api.login( credentials.username, credentials.password )
	.done (function (data) {
		console.log("Logged in as "+data.login.lgusername);
		fetchJSONList(configFile).done(function(parsedConfig) {
			configObject = parsedConfig;
			wikiProjectCategories = [configObject["WikiProject main category"]]
				.concat(configObject["Other WikiProject template categories not included in 'WikiProject main category'"]);
			getTemplateCategories();
		});
	} ).fail (function(error) {
		console.error("Error logging in:");
		console.error(error);
		return;
	} );

function fetchJSONList(listName) {
	//console.log("Attempting to fetch " + listName + "...");
	return $.ajax({
		url: apiUrl,
		error: function (jsondata) {
			console.warn("Unable to fetch contents of " + listName + ":");
			console.log(jsondata);
			return {};				
		}, data: {action:'parse', format:'json', prop:'wikitext', page: listName, formatversion: '2', origin: '*' }
	}).then(function(response) {
		var parsedList = {};
		var listData = response.parse;
		//console.log("Attempting to parse " + listName + "...");
		if (listData && listData.wikitext) {
			try {
				parsedList = JSON.parse(listData.wikitext);
				console.log("Successfully parsed " + listName);
			} catch (jsonerror) {
				console.warn("Error parsing JSON list " + listName + ":");
				console.log(jsonerror);
			}
		}
		return parsedList;
	});
}

function getTemplateCategories(cont) { // Recursively call API
	var query = {
		action: "query",
		list: "categorymembers",
		cmtitle: configObject["WikiProject main category"],
		cmtype: "subcat",
		cmlimit: "max",
		origin: '*'
	};
	if (cont) {
		query = Object.assign(query, cont);
	}
	//console.log("Fetching subcategories of " + query.cmtitle + "...");
	api.get( query )
		.done (function (data) {
			if (data && data.query && data.query.categorymembers) { //API query returned members
				Object.entries(data.query.categorymembers).forEach( function(item) {
					wikiProjectCategories.push(item[1].title);
				} );
			}
			if (data && data.continue) { //More results are available
				getTemplateCategories(data.continue);
			} else {
				console.log("Fetching contents of: " + wikiProjectCategories
					.map(function (e) { return e.toString().replace(/(Category:|WikiProject |banner wrapper )/ig, ""); })
					.join(", ") );
				getTemplatesFromCategories();
			}
		} ).fail (function(error) {
			console.warn("Error getting list of categories:");
			console.log(error);
		} );
	return;
}

function getTemplatesFromCategories(catTitle, cont) { // Recursively call API
	if (typeof catTitle === 'undefined') { // Grab next item in wikiProjectCategories
		catTitle = wikiProjectCategories.pop();
	}
	if (typeof catTitle === 'undefined') { // No remaining entries in wikiProjectCategories
		// Manually add Wikiprojects with /s in their title
		jQuery.extend( wikiprojects, configObject.includelist );
		writeList();
	} else {
		
		var query = {
			action: "query",
			list: "categorymembers",
			cmtitle: catTitle,
			cmtype: "page",
			cmnamespace: "10",
			cmlimit: "max",
			origin: '*'
		};
		//console.log("Fetching contents of " + query.cmtitle + "...");
		if (cont) {
			query = Object.assign(query, cont);
		}
		api.get( query )
			.done (function (data) {
				if (data && data.query && data.query.categorymembers) { //API query returned members
					Object.entries(data.query.categorymembers).forEach( function(item) {
						var title = item[1].title.match(/^Template:WikiProject\s(.*)$/);
						if ( (title && title[1] && title[1] !== "") && ( title[1].indexOf("/") == -1 || title[1].match(/ task ?force$/i) ) ) { //Valid page name format
							title[1] = title[1].replace(/ task ?force$/i,"");
							if( !(configObject.blocklist[ title[1] ]) ) { //Not on blocklist
								wikiprojects[ title[1] ] = item[1].title.replace("Template:", "");
							}
						}
					} );
				}
				if (data && data.continue) { //More results are available
					getTemplatesFromCategories(catTitle, data.continue);
				} else {
					getTemplatesFromCategories();
				}
			} ).fail (function(error) {
				console.warn("Error getting list of templates:");
				console.log(error);
			} );
		return;
	}
}

function writeList() {
	wikiprojects = Object.keys(wikiprojects).sort().reduce(
		(obj, key) => { 
			obj[key] = wikiprojects[key]; 
			return obj;
		}, 
		{}
	);
	
	//console.log("Length of list: " + Object.keys(wikiprojects).length);
	//console.log(wikiprojects);
	
	var params = {
		action: 'edit',
		title: templateList,
		text: JSON.stringify(wikiprojects),
		summary: "Update WikiProject list",
		watchlist:"unwatch",
		bot: 'true'
	};
	//console.log("Writing to " + params.title + "...");
	api.postWithToken("csrf", params ).done( function(reslt) {
		console.log(templateList + " updated.");
		//console.log(reslt);
	} ).fail( function(reslt) {
		console.warn("Error updating " + templateList + ":");
		console.log(reslt);
	} );
}

})();
