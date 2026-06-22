(function () {
    'use strict';

    var proxyUrl = 'https://api.allorigins.win/raw?url='; 
    var targetUrl = 'https://uaserials.my/index.php?do=search';

    function UASerialsPlugin() {
        var network = new Lampa.Reguest();

        this.search = function (query, callback) {
            var formData = new FormData();
            formData.append('do', 'search');
            formData.append('subaction', 'search');
            formData.append('story', query);

            network.native(proxyUrl + encodeURIComponent(targetUrl), function (html) {
                try {
                    var cards = parseHtml(html);
                    callback(cards);
                } catch (e) {
                    console.log('UASerials parse error:', e);
                    callback([]);
                }
            }, function () {
                callback([]);
            }, formData, { method: 'POST' });
        };

        function parseHtml(html) {
            var parser = new DOMParser();
            var doc = parser.parseFromString(html, 'text/html');
            var items = doc.querySelectorAll('.short-story, .movie-item, [class*="story"]'); 
            var results = [];

            items.forEach(function (item) {
                var linkElement = item.querySelector('a');
                var imgElement = item.querySelector('img');
                var titleElement = item.querySelector('.title, .movie-title, [class*="title"]') || linkElement;

                if (linkElement && titleElement) {
                    var title = titleElement.innerText.trim();
                    var url = linkElement.getAttribute('href');
                    var img = imgElement ? (imgElement.getAttribute('src') || imgElement.getAttribute('data-src')) : '';

                    if (img && !img.startsWith('http')) {
                        img = 'https://uaserials.my' + img;
                    }

                    results.push({
                        name: title,
                        original_name: 'UASerials.my',
                        url: url,
                        img: img,
                        id: url,
                        method: 'view',
                        card_id: url
                    });
                }
            });

            return results;
        }
    }

    function createViewComponent() {
        Lampa.Component.add('uaserials_view', function (object, exampl) {
            var network = new Lampa.Reguest();
            var scroll = new Lampa.Scroll({ mask: true, over: true });
            var html = $('<div></div>');

            this.create = function () {
                var self = this;
                html.append('<div style="padding: 20px; text-align: center;">Завантаження з UASerials...</div>');

                network.native(proxyUrl + encodeURIComponent(object.url), function (pageHtml) {
                    html.empty();
                    var parser = new DOMParser();
                    var doc = parser.parseFromString(pageHtml, 'text/html');
                    var iframe = doc.querySelector('iframe[src*="ashdi"], iframe[src*="asgdi"], iframe[src*="player"], .video-inside iframe');
                    
                    if (iframe) {
                        var videoUrl = iframe.getAttribute('src');
                        if (videoUrl.startsWith('//')) videoUrl = 'https:' + videoUrl;

                        html.append('<div style="padding: 20px;"><h2>' + object.name + '</h2><p>Плеєр знайдено!</p></div>');
                        
                        var button = $('<div class="button selector" style="margin: 20px; max-width: 300px; text-align: center; background: #3c3c3c; padding: 15px; border-radius: 8px; cursor: pointer;">Дивитися</div>');
                        button.on('hover:enter', function () {
                            Lampa.Player.play({ url: videoUrl, title: object.name });
                        });
                        html.append(button);
                    } else {
                        html.append('<div style="padding: 20px;">Плеєр не знайдено (можливо, потрібен інший парсер).</div>');
                    }

                    scroll.append(html);
                    self.activity.loader(false);
                    self.activity.toggle();
                }, function () {
                    html.empty().append('<div style="padding: 20px;">Помилка завантаження сторінки.</div>');
                    self.activity.loader(false);
                });

                return scroll.render();
            };

            this.start = function () {
                Lampa.Controller.add('content', {
                    toggle: function () {
                        Lampa.Controller.collectionSet(scroll.render(), html);
                        Lampa.Controller.collectionFocus(false, scroll.render());
                    },
                    left: function () { Lampa.Controller.toggle('menu'); },
                    back: function () { Lampa.Activity.backward(); }
                });
                Lampa.Controller.toggle('content');
            };

            this.render = function () { return scroll.render(); };
            this.destroy = function () { scroll.destroy(); html.remove(); };
        });
    }

    function init() {
        if (window.UASerialsPluginStarted) return;
        window.UASerialsPluginStarted = true;

        var plugin = new UASerialsPlugin();
        Lampa.Search.addSource({
            title: 'UASerials (UA)',
            search: plugin.search,
            component: 'uaserials_view'
        });

        createViewComponent();
    }

    if (window.lampa_started) {
        init();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type == 'ready') init();
        });
    }
})();
