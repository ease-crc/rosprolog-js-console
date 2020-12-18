
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

    this.init = function () {
        var queryInput = ace.edit(queryDiv);
        //queryInput.setTheme("ace/theme/solarized_light");
        queryInput.getSession().setMode("ace/mode/prolog");
        queryInput.getSession().setUseWrapMode(true);
        queryInput.setOptions({
            showGutter: false,
            printMarginColumn: false,
            highlightActiveLine: false,
            highlightGutterLine: false,
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: true,
            wrap: false,
            maxLines: Infinity
        });
        queryInput.commands.addCommand({
            name: 'send_query', readOnly: false,
            bindKey: {win: 'Ctrl-Enter',  mac: 'Command-Enter'},
            exec: function(editor) { that.query(); }
        });
        queryInput.commands.addCommand({
            name: 'next_result', readOnly: false,
            bindKey: {win: 'Ctrl-;',  mac: 'Command-;'},
            exec: function(editor) { that.nextSolution(); }
        });
        queryInput.commands.addCommand({
            name: 'next_history', readOnly: false,
            bindKey: {win: 'Up',  mac: 'Up'},
            exec: function(editor) { that.nextHistoryItem(); }
        });
        queryInput.commands.addCommand({
            name: 'previous_history', readOnly: false,
            bindKey: {win: 'Down',  mac: 'Down'},
            exec: function(editor) { that.previousHistoryItem(); }
        });
        queryInput.setShowPrintMargin(false);
        queryInput.renderer.setScrollMargin(6, 6, 6, 6);
        queryInput.resize(true);
        
        this.initAutoCompletion();
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
    
    this.query = function (query_string) {
      var query = ace.edit(queryDiv);
      if(!query_string) {
        query_string = query.getValue().trim();
      }
    
      if (query_string.substr(query_string.length - 1) == ".") {
        query_string = query_string.substr(0, query_string.length - 1);
      }

      prolog = that.newProlog();
      that.on_query(prolog.qid,query_string);

      prolog.jsonQuery(query_string, function(result) {
          that.on_query_answer(prolog.qid,result);
      }, mode=1); // incremental mode
      query.setValue("");

      that.addHistoryItem(query_string);
      historyIndex = -1;
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
      var queryInput = ace.edit(queryDiv);
      queryInput.setValue(val, -1);
      if(focus) queryInput.focus();
    };
    
    ///////////////////////////////
    //////////// History
    ///////////////////////////////

    this.addHistoryItem = function (query) {
        var pl = new ROSPrologClient(client.ros, {});
        if(!pl) return;
        pl.jsonQuery("history_add('"+query.replaceAll("'","\'")+"').",
            function(result) {
                //console.info(result);
            }
        );
    };

    this.setHistoryItem = function (index) {
        var pl = new ROSPrologClient(client.ros, {});
        if(!pl) return;
        pl.jsonQuery("history_get("+index+",Q).",
            function(result) {
                if(result.solution) {
                    var queryInput = ace.edit(queryDiv);
                    queryInput.setValue(result.solution.Q + ".");
                    queryInput.focus();
                    historyIndex = index;
                }
            }
        );
    };

    this.nextHistoryItem = function () {
        this.setHistoryItem(historyIndex+1);
    };
    
    this.previousHistoryItem = function () {
        if(historyIndex>0) {
            this.setHistoryItem(historyIndex-1);
        }
    };
};
