(function() {
  'use strict';

  var Defined = {
    api: 'lampac',
    localhost: 'http://wtch.ch/',
    apn: ''
  };

  var balansers_with_search;
  
  var unic_id = Lampa.Storage.get('lampac_unic_id', '');
  if (!unic_id) {
    unic_id = Lampa.Utils.uid(8).toLowerCase();
    Lampa.Storage.set('lampac_unic_id', unic_id);
  }
  
  function getAndroidVersion() {
    if (Lampa.Platform.is('android')) {
      try {
        var current = AndroidJS.appVersion().split('-');
        return parseInt(current.pop());
      } catch (e) {
        return 0;
      }
    } else {
      return 0;
    }
  }

  var hostkey = 'http://wtch.ch'.replace('http://', '').replace('https://', '');

  if (!window.rch_nws || !window.rch_nws[hostkey]) {
    if (!window.rch_nws) window.rch_nws = {};

    window.rch_nws[hostkey] = {
      type: Lampa.Platform.is('android') ? 'apk' : Lampa.Platform.is('tizen') ? 'cors' : undefined,
      startTypeInvoke: false,
      rchRegistry: false,
      apkVersion: getAndroidVersion()
    };
  }

  window.rch_nws[hostkey].typeInvoke = function rchtypeInvoke(host, call) {
    if (!window.rch_nws[hostkey].startTypeInvoke) {
      window.rch_nws[hostkey].startTypeInvoke = true;

      var check = function check(good) {
        window.rch_nws[hostkey].type = Lampa.Platform.is('android') ? 'apk' : good ? 'cors' : 'web';
        call();
      };

      if (Lampa.Platform.is('android') || Lampa.Platform.is('tizen')) check(true);
      else {
        var net = new Lampa.Reguest();
        net.silent('http://wtch.ch'.indexOf(location.host) >= 0 ? 'https://github.com/' : host + '/cors/check', function() {
          check(true);
        }, function() {
          check(false);
        }, false, {
          dataType: 'text'
        });
      }
    } else call();
  };

  window.rch_nws[hostkey].Registry = function RchRegistry(client, startConnection) {
    window.rch_nws[hostkey].typeInvoke('http://wtch.ch', function() {

      client.invoke("RchRegistry", {
        host: location.host,
        rchtype: Lampa.Platform.is('android') ? 'apk' : Lampa.Platform.is('tizen') ? 'cors' : (window.rch_nws[hostkey].type || 'web'),
        apkVersion: Lampa.Platform.is('android') ? (window.rch_nws[hostkey].apkVersion || 0) : 0,
        player: Lampa.Storage.field('player')
      });

      if (window.rch_nws[hostkey].rchRegistry)
        return;

      window.rch_nws[hostkey].rchRegistry = true;

      var handled = false;
      client.on('RchRegistry', function (clientIp, connectionId, rchtype) {
        if (startConnection && !handled) {
          handled = true;
          startConnection();
        }
      });

      client.on("RchClient", function(rchId, url, data, headers, returnHeaders) {
        var network = new Lampa.Reguest();
        
        function sendResult(uri, html) {
          $.ajax({
            url: 'http://wtch.ch/rch/' + uri + '?id=' + rchId,
            type: 'POST',
            data: html,
            async: true,
            cache: false,
            contentType: false,
            processData: false,
            success: function(j) {},
            error: function() {
              client.invoke("RchResult", rchId, '');
            }
          });
        }

        function result(html) {
          if (Lampa.Arrays.isObject(html) || Lampa.Arrays.isArray(html)) {
            html = JSON.stringify(html);
          }

          if (typeof CompressionStream !== 'undefined' && html && html.length > 1000) {
            var compressionStream = new CompressionStream('gzip');
            var encoder = new TextEncoder();
            var readable = new ReadableStream({
              start: function(controller) {
                controller.enqueue(encoder.encode(html));
                controller.close();
              }
            });
            var compressedStream = readable.pipeThrough(compressionStream);
            new Response(compressedStream).arrayBuffer()
              .then(function(compressedBuffer) {
                var compressedArray = new Uint8Array(compressedBuffer);
                if (compressedArray.length > html.length) {
                  sendResult('result', html);
                } else {
                  sendResult('gzresult', compressedArray);
                }
              })
              .catch(function() {
                sendResult('result', html);
              });

          } else {
            sendResult('result', html);
          }
        }

        if (url == 'eval') {
          console.log('RCH', url, data);
          result(eval(data));
        } else if (url == 'evalrun') {
          console.log('RCH', url, data);
          eval(data);
        } else if (url == 'ping') {
          result('pong');
        } else {
          console.log('RCH', url);
          network["native"](url, result, function(e) {
            console.log('RCH', 'result empty, ' + e.status);
            result('');
          }, data, {
            dataType: 'text',
            timeout: 1000 * 8,
            headers: headers,
            returnHeaders: returnHeaders
          });
        }
      });

      client.on('Connected', function(connectionId) {
        console.log('RCH', 'ConnectionId: ' + connectionId);
        window.rch_nws[hostkey].connectionId = connectionId;
      });
      client.on('Closed', function() {
        console.log('RCH', 'Connection closed');
      });
      client.on('Error', function(err) {
        console.log('RCH', 'error:', err);
      });
    });
  };

  window.rch_nws[hostkey].typeInvoke('http://wtch.ch', function() {});

  function rchInvoke(json, call) {
    if (!window.nwsClient) 
      window.nwsClient = {};

    var client = window.nwsClient[hostkey];
    if (client && client.connectionId != null) {
      call();
    }
    else if (client) {
      console.log('RCH', 'Reconnecting...');
      client.reconnect(function() {
        call();
      });
    }
    else {
      window.nwsClient[hostkey] = new NativeWsClient(json.nws, {
        autoReconnect: true
      });

      window.nwsClient[hostkey].on('Connected', function(connectionId) {
        window.rch_nws[hostkey].Registry(window.nwsClient[hostkey], function() {
          call();
        });
      });

      window.nwsClient[hostkey].connect();
    }
  }

  function rchRun(json, call) {
    if (typeof NativeWsClient == 'undefined') {
      Lampa.Utils.putScript(["http://wtch.ch/js/nws-client-es5.js?v21042026"], function() {}, false, function() {
        rchInvoke(json, call);
      }, true);
    } else {
      rchInvoke(json, call);
    }
  }

  function account(url) {
    url = url + '';
    if (url.indexOf('account_email=') == -1) {
      var email = Lampa.Storage.get('account_email');
      if (email) url = Lampa.Utils.addUrlComponent(url, 'account_email=' + encodeURIComponent(email));
    }
    if (url.indexOf('uid=') == -1) {
      var uid = Lampa.Storage.get('lampac_unic_id', '');
      if (uid) url = Lampa.Utils.addUrlComponent(url, 'uid=' + encodeURIComponent(uid));
    }
    if (url.indexOf('token=') == -1) {
      var token = '';
      if (token != '') url = Lampa.Utils.addUrlComponent(url, 'token=');
    }
    if (url.indexOf('nws_id=') == -1) {
      var nws_id = Lampa.Storage.get('lampac_nws_id', '');
      if (nws_id) url = Lampa.Utils.addUrlComponent(url, 'nws_id=' + encodeURIComponent(nws_id));
    }
    return url;
  }

  function addHeaders() {
    var kit_aesgcmkey = Lampa.Storage.get('kit_aesgcmkey', '');
    if (kit_aesgcmkey) return { 'X-Kit-AesGcm': Lampa.Storage.get('kit_aesgcmkey', '') };
    return {};
  }

  var Network = Lampa.Reguest;

  function component(object) {
    var network = new Network();
    var scroll = new Lampa.Scroll({ mask: true, over: true });
    var files = new Lampa.Explorer(object);
    var filter = new Lampa.Filter(object);
    var sources = {};
    var balanser;
    var source;
    var filter_sources = {};
    var filter_find = { season: [], voice: [] };
	
    if (balansers_with_search == undefined) {
      network.timeout(10000);
      network.silent(account('http://wtch.ch/lite/withsearch'), function(json) {
        balansers_with_search = json;
      }, function() {
        balansers_with_search = [];
      });
    }
	
    function balanserName(j) {
      var bals = j.balanser;
      var name = j.name.split(' ')[0];
      return (bals || name).toLowerCase();
    }
	
    this.initialize = function() {
      var _this = this;
      this.loading(true);
      
      filter.onSearch = function(value) {
        Lampa.Activity.replace({ search: value, clarification: true, similar: true });
      };
      
      filter.onBack = function() { _this.start(); };
      
      scroll.body().addClass('torrent-list');
      files.appendFiles(scroll.render());
      files.appendHead(filter.render());
      scroll.minus(files.render().find('.explorer__files-head'));
      this.loading(false);

      this.createSource().then(function() {
        _this.find();
      }).catch(function() {
        _this.empty();
      });
    };

    this.createSource = function() {
      var _this = this;
      return new Promise(function(resolve, reject) {
        var url = _this.requestParams(Defined.localhost + 'lite/events?life=true');
        network.silent(account(url), function(json) {
          if (json && json.online) {
            json.online.forEach(function(j) {
              var name = balanserName(j);
              sources[name] = { url: j.url, name: j.name };
            });
            filter_sources = Lampa.Arrays.getKeys(sources);
            balanser = filter_sources[0];
            source = sources[balanser].url;
            resolve();
          } else reject();
        }, reject);
      });
    };

    this.requestParams = function(url) {
      var query = [];
      query.push('id=' + encodeURIComponent(object.movie.id));
      query.push('title=' + encodeURIComponent(object.movie.title || object.movie.name));
      query.push('serial=' + (object.movie.name ? 1 : 0));
      return url + (url.indexOf('?') >= 0 ? '&' : '?') + query.join('&');
    };

    this.find = function() {
      network.native(account(this.requestParams(source)), this.parse.bind(this), this.empty.bind(this));
    };

    this.parse = function(str) {
      var _this = this;
      var items = [];
      try {
        var html = $('<div>' + str + '</div>');
        html.find('.videos__item').each(function() {
          var item = $(this);
          var data = JSON.parse(item.attr('data-json'));
          data.title = item.text();
          items.push(data);
        });
      } catch(e) {}

      if (items.length) {
        this.draw(items, {
          onEnter: function(item) {
            Lampa.Player.play({ title: item.title, url: item.url });
          }
        });
      } else this.empty();
    };

    this.render = function() { return scroll.render(); };
    this.destroy = function() { network.clear(); scroll.destroy(); files.destroy(); };
  }

  if (window.lampa_plugin_uaseries) return;
  window.lampa_plugin_uaseries = true;

  function startPlugin() {
    Lampa.Component.add('uaseries_plugin', component);

    Lampa.Listener.follow('extension', function(e) {
      if (e.name == 'init') {
        if (Lampa.Extensions && Lampa.Extensions.add) {
          Lampa.Extensions.add({
            id: 'uaseries_plugin',
            name: 'UA Студії (wtch.ch)',
            type: 'online',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
            onSet: function(object) {
              Lampa.Activity.push({
                title: 'UA Студії',
                component: 'uaseries_plugin',
                movie: object.movie,
                page: 1
              });
            }
          });
        }
      }
    });
  }

  if (window.Lampa) startPlugin();
})();
