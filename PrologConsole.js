
var ace = require('brace');
require('brace/mode/prolog');
require('brace/mode/xml');
require('brace/theme/monokai');
require('brace/theme/solarized_light');
require('brace/ext/language_tools');
var aceLangTools = ace.acequire("ace/ext/language_tools");

var ROSPrologClient = require('@openease/ros-clients').ROSPrologClient;

/**
 * A Prolog console with history pane.
 **/
module.exports = function(client, options) {
    var that = this;
    var prolog;
    
    this.on_query        = options.on_query || function(qid,q){};
    this.on_query_answer = options.on_query_answer || function(qid,answer){};
    this.on_query_finish = options.on_query_finish || function(qid){};
        
    var queryDiv = options.query_div || 'user_query';
    
    // Names of prolog predicates and modules for auto completion
    var prologNames;
  
    // The index to the currently active history item
    // history items are saved on the server and queried using AJAX
    var historyIndex = -1;
    
    this.rdf_namespaces = {};

    this.init = function () {
        var userQuery = ace.edit(queryDiv);
        userQuery.setTheme("ace/theme/solarized_light");
        userQuery.getSession().setMode("ace/mode/prolog");
        userQuery.getSession().setUseWrapMode(true);
        userQuery.setOptions({
            showGutter: false,
            printMarginColumn: false,
            highlightActiveLine: false,
            highlightGutterLine: false,
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: true,
            wrap: false
        });
        userQuery.commands.addCommand({
            name: 'send_query', readOnly: false,
            bindKey: {win: 'Ctrl-Enter',  mac: 'Command-Enter'},
            exec: function(editor) { that.query(); }
        });
        userQuery.commands.addCommand({
            name: 'next_result', readOnly: false,
            bindKey: {win: 'Ctrl-;',  mac: 'Command-;'},
            exec: function(editor) { that.nextSolution(); }
        });
        userQuery.commands.addCommand({
            name: 'next_history', readOnly: false,
            bindKey: {win: 'Up',  mac: 'Up'},
            exec: function(editor) { that.nextHistoryItem(); }
        });
        userQuery.commands.addCommand({
            name: 'previous_history', readOnly: false,
            bindKey: {win: 'Down',  mac: 'Down'},
            exec: function(editor) { that.previousHistoryItem(); }
        });
        userQuery.resize(true);
        
        this.initAutoCompletion();
        
        setInterval(that.updateNamespaces, 10000);
        that.updateNamespaces();
    };
    
    this.updateNamespaces = function(objectName) {
        if(!client.ros) return;
        var pl = new ROSPrologClient(client.ros, {});
        if(!pl) return;
        pl.jsonQuery("findall([_X,_Y], rdf_current_ns(_X,_Y), NS).",
            function(result) {
                pl.finishClient();
                if(result.solution) {
                  var namespaces = {};
                  for(i in result.solution.NS) {
                    namespaces[result.solution.NS[i][1]] = result.solution.NS[i][0];
                  }
                  that.rdf_namespaces = namespaces;
                }
            }
        );
    };
    
    this.queryPredicateNames = function() {
      if(!client.ros) return;
      if( ! prologNames ) {
        var pl = new ROSPrologClient(client.ros, {});
        if(!pl) return;
        prologNames = [];
        // Query for predicates/modules and collect all results
        pl.jsonQuery("findall(X, current_predicate(X/_);current_module(X), L)", function(x) {
          if (x.value) {
            // Parse each value
            var lines = x.value.split("\n");
            for(i=1; i<lines.length-1; ++i) {
              var tmp = lines[i].split(" = ");
              if(tmp.length==2) {
                prologNames.push(tmp[1].trim());
              }
            }
            prologNames.sort();
          }
          else {
            console.warn("Unable to query prolog names.");
            console.warn(x);
          }
        }, mode=0);
      }
      return prologNames;
    };
    
    this.initAutoCompletion = function() {
        // Add completer for prolog code
        aceLangTools.addCompleter({
            getCompletions: function(editor, session, pos, prefix, callback) {
                var names = that.queryPredicateNames();
                if( names ) {
                  callback(null, names.map(function(x) {
                      return {name: x, value: x, score: 100, meta: "pl"};
                  }));
                }
            }
        });
    };

    this.newProlog = function() {
      if(!client.ros) return;
      if (prolog && prolog.finished == false) {
        that.finishProlog(prolog);
        prolog = undefined;
      }
      return new ROSPrologClient(client.ros, {});
    }

    this.finishProlog = function(pl) {
        pl.finishClient();
        that.on_query_finish(pl.qid);
    };
    
    this.query = function () {
      var query = ace.edit(queryDiv);
      var q = query.getValue().trim();
    
      if (q.substr(q.length - 1) == ".") {
        q = q.substr(0, q.length - 1);
        prolog = this.newProlog();
        that.on_query(prolog.qid,q);
        
        prolog.jsonQuery(q, function(result) {
            that.on_query_answer(prolog.qid,result);
        }, mode=1); // incremental mode
        query.setValue("");
        
        that.addHistoryItem(q);
        historyIndex = -1;
      }
      else {
        if (prolog != null && prolog.finished == false) {
          that.finishProlog(prolog);
          prolog = undefined;
        }
      }
    };

    this.nextSolution = function () {
      if (prolog != null && prolog.finished == false) {
        prolog.nextQuery(function(result) {
            that.on_query_answer(prolog.qid,result);
        });
        ace.edit(queryDiv).focus();
      }
    };

    // set the value of the query editor and move the cursor to the end
    this.setQueryValue = function (val, focus){
      var user_query = ace.edit(queryDiv);
      user_query.setValue(val, -1);
      if(focus) user_query.focus();
    };
    
    ///////////////////////////////
    //////////// History
    ///////////////////////////////

    this.addHistoryItem = function (query) {
//         $.ajax({
//             url: "/QA/history/add",
//             type: "POST",
//             contentType: "application/json",
//             data: JSON.stringify({query: query}),  
//             dataType: "json"
//         }).done( function (request) {});
    };

    this.setHistoryItem = function (index) {
        // TODO: maybe better query all items once?
//         $.ajax({
//             url: "/QA/history/get",
//             type: "POST",
//             contentType: "application/json",
//             data: JSON.stringify({index: index}),  
//             dataType: "json",
//             success: function (data) {
//                  ace.edit(queryDiv).setValue(data.item);
//                  historyIndex = data.index;
//             }
//         }).done( function (request) {});
    };

    this.nextHistoryItem = function () {
//         this.setHistoryItem(historyIndex+1);
    };
    
    this.previousHistoryItem = function () {
//         this.setHistoryItem(historyIndex-1);
    };
    
    this.zoomIn = function() {
//         $('#history').css('font-size', parseInt($('#history').css("font-size")) + 2);
        $('#user_query').css('font-size', parseInt($('#user_query').css("font-size")) + 2);
    };
    
    this.zoomOut = function() {
//         $('#history').css('font-size', parseInt($('#history').css("font-size")) - 2);
        $('#user_query').css('font-size', parseInt($('#user_query').css("font-size")) - 2);
    };
};
