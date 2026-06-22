(function() {
  'use strict';

  // Використовуємо UA пули та дзеркала для UAKINO / UASerials
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

      if (window.rch_nws[hostkey].rchRegistry) return;
      window.rch_nws[hostkey].rchRegistry = true;

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
            error: function() { client.invoke("RchResult", rchId, ''); }
          });
        }

        function result(html) {
          if (Lampa.Arrays.isObject(html) || Lampa.Arrays.isArray(html)) html = JSON.stringify(html);
          sendResult('result', html);
        }

        if (url == 'ping') result('pong');
        else {
          network["native"](url, result, function() { result(''); }, data, {
            dataType: 'text',
            timeout: 8000,
            headers: headers,
            returnHeaders: returnHeaders
          });
        }
      });
    });
  };

  function account(url) {
    if (url.indexOf('uid=') == -1) {
      var uid = Lampa.Storage.get('lampac_unic_id', '');
      if (uid) url = Lampa.Utils.addUrlComponent(url, 'uid=' + encodeURIComponent(uid));
    }
    return url;
  }

  function component(object) {
    var network = new Lampa.Reguest();
    var scroll = new Lampa.Scroll({ mask: true, over: true });
    var files = new Lampa.Explorer(object);
    var filter = new Lampa.Filter(object);
    var sources = {};
    var source;

    this.initialize = function() {
      var _this = this;
      this.loading(true);
      
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

    // Форсуємо підключення модулів UAкіно та UAсеріали через парсер
    this.createSource = function() {
      var _this = this;
      return new Promise(function(resolve, reject) {
        var url = _this.requestParams(Defined.localhost + 'lite/events?life=true');
        network.silent(account(url), function(json) {
          // Задаємо пріоритет суто на українські балансери
          sources['uakino'] = { url: Defined.localhost + 'lite/uakino', name: 'UAKINO' };
          sources['uaserials'] = { url: Defined.localhost + 'lite/uaserials', name: 'UASerials' };
          
          source = sources['uakino'].url; // Старт з UAкіно за замовчуванням
          resolve();
        }, function() {
          // Якщо сервер недоступний, все одно створюємо локальні лінки
          sources['uakino'] = { url: Defined.localhost + 'lite/uakino', name: 'UAKINO' };
          sources['uaserials'] = { url: Defined.localhost + 'lite/uaserials', name: 'UASerials' };
          source = sources['uakino'].url;
          resolve();
        });
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
      } else {
        // Якщо на uakino порожньо, автоматично перемикаємо на uaserials
        if (source.indexOf('uakino') >= 0) {
          source = sources['uaserials'].url;
          this.find();
        } else this.empty();
      }
    };

    this.render = function() { return scroll.render(); };
    this.destroy = function() { network.clear(); scroll.destroy(); files.destroy(); };
  }

  // Реєстрація плагіна як окремого онлайн-модуля для UAKINO / UASerials
  if (window.lampa_plugin_uaseries) return;
  window.lampa_plugin_uaseries = true;

  function startPlugin() {
    Lampa.Component.add('uaseries_plugin', component);

    Lampa.Listener.follow('extension', function(e) {
      if (e.name == 'init') {
        if (Lampa.Extensions && Lampa.Extensions.add) {
          Lampa.Extensions.add({
            id: 'uaseries_plugin',
            name: 'UAKINO / UASerials',
            type: 'online',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffeb3b" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
            onSet: function(object) {
              Lampa.Activity.push({
                title: 'UAKINO / UASerials',
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
