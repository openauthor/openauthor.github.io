(function() {
  'use strict';
   /*jshint validthis:true */
  function provider($q, $http, constants, urlService, tocCache, mdIndexCache) {
    function getYamlResponse(response){
      return jsyaml.load(response.data);
    }

    function valueHttpWrapper(value){
      var deferred = $q.defer();
      deferred.resolve(value);
      return deferred.promise;
    }

    this.valueHttpWrapper = valueHttpWrapper;
    this.getNavBar = function(){
      return $http.get(constants.TocFile)
      .then(getYamlResponse);
    };

    this.getContent = function(path){
      return $http.get(path)
      .then(getYamlResponse);
    };

    this.getMarkdownContent = function(path){
      function getContentComplete(response){
        return response.data;
      }
      return $http.get(path)
      .then(getContentComplete);
    };

    this.getTocContent = function(path) {
      if (!path) return valueHttpWrapper(null);
      var toc;
      path = urlService.normalizeUrl(path);
      var temp = tocCache.get(path);
      if (temp) {
        return valueHttpWrapper(temp);
      } else {
        toc = {
          path: path
        };
        return $http.get(path)
          .then(function(result) {
            var content = getYamlResponse(result);
            toc.content = content;
            tocCache.put(path, toc);
            return toc;
          }).catch(function(result) {
            tocCache.put(path, toc);
            return toc;
          });
      }
    };

    this.getMdContent = function(path) {
      if (!path) return valueHttpWrapper(null);
      var tempMdIndex;
      var pathInfo = urlService.getPathInfo(path);
      path = urlService.normalizeUrl((pathInfo.tocPath || '') + '/' + constants.MdIndexFile);

      if (path) {
        tempMdIndex = mdIndexCache.get(path);
        if (tempMdIndex !== undefined) {
          return valueHttpWrapper(tempMdIndex);
        } else {
          return $http.get(path)
            .then(function(result) {
              var content = getYamlResponse(result);
              mdIndexCache.put(path, content);
              return content;
            }).catch(function(result) {
              mdIndexCache.put(path, null);
              return valueHttpWrapper(null);
            });
        }
      } else {
        return valueHttpWrapper(null);
      }
    };

    this.getDefaultItem = function(array, action) {
      if (!action) return;
      if (array && array.length > 0) {
        return action(array[0]);
      }
    };
  }

  angular.module('docascode.contentService', ['docascode.constants', 'docascode.urlService'])
    .factory('tocCache', ['$cacheFactory', function($cacheFactory) {
      return $cacheFactory('toc-cache');
    }])
    .factory('mdIndexCache', ['$cacheFactory', function($cacheFactory) {
      return $cacheFactory('mdIndex-cache');
    }])
    .service('contentService', ['$q', '$http', 'docConstants', 'urlService', 'tocCache', 'mdIndexCache', provider]);

})();
(function() {
  'use strict';
  /*jshint validthis:true */
  function provider() {
    var player;
    function csplay(player, compileServiceBaseUrl) {
      if (typeof compileServiceBaseUrl === "undefined") {
        compileServiceBaseUrl = "";
      }
      if (compileServiceBaseUrl.substr(-1, 1) !== "/") {
        compileServiceBaseUrl += "/";
      }
      if (typeof player === "string") {
        player = document.getElementById(player);
      }
      // Create editor, split bar and output
      var top = document.createElement("div");
      var splitbar = document.createElement("div");
      var bottom = document.createElement("div");
      top.innerHTML = player.innerHTML;
      top.className = "csplay_editor";
      splitbar.className = "csplay_splitbar";
      bottom.className = "csplay_output";
      var cloned = player.cloneNode(false);
      player.parentNode.replaceChild(cloned, player);
      player = cloned;
      player.appendChild(top);
      player.appendChild(splitbar);
      player.appendChild(bottom);
      // Create ace editor
      var editor = ace.edit(top);
      editor.getSession().setMode("ace/mode/csharp");
      // Use jquery from here
      player = $(player);
      top = $(top);
      splitbar = $(splitbar);
      bottom = $(bottom);
      // Make splitbar draggable
      var dragging = false;
      splitbar.mousedown(function(e) {
        dragging = true;
      });
      player.mouseup(function() {
        dragging = false;
      }).mousemove(function(e) {
        if (dragging) {
          var topHeight = e.pageY - top.offset().top;
          var bottomHeight = top.outerHeight(true) + bottom.outerHeight(true) - topHeight;
          var splitbarHeight = splitbar.outerHeight(true);
          if (topHeight > 0 && bottomHeight > 0) {
            top.css("height", topHeight);
            bottom.css("height", "calc(100% - " + (topHeight + splitbarHeight) + "px)");
            editor.resize();
          }
          e.preventDefault();
        }
      });
      return {
        run: function(callback) {
          $.ajax({
            url: compileServiceBaseUrl + "run",
            type: "POST",
            data: editor.getValue(),
            contentType: "text/plain",
            success: function(data, status, xhr) {
              bottom.html(data).removeClass("error");
              if (typeof callback.success === "function") {
                callback.success(data, status, xhr);
              }
            },
            error: function(xhr, status, message) {
              if (typeof xhr.responseJSON.error_message === "string") {
                bottom.text(xhr.responseJSON.error_message).addClass("error");
              } else {
                bottom.text(xhr.responseText).addClass("error");
              }
              if (typeof callback.error === "function") {
                callback.error(xhr, status, message);
              }
            },
            complete: function(xhr, status) {
              if (typeof callback.complete === "function") {
                callback.complete(xhr, status);
              }
            }
          });
        },
        clearOutput: function() {
          bottom.html("");
        },
        editor: editor
      };
    }

    function createPlayer() {
      var player = csplay("player", "http://dotnetsandbox.azurewebsites.net" /* hardcode for now */ );
      player.editor.setTheme("ace/theme/ambiance");
      player.editor.setFontSize(16);
      $("#run").click(function() {
        var that = $(this);
        that.html('<i class="fa fa-refresh fa-fw fa-spin"></i>Run');
        that.addClass("disabled");
        player.run({
          complete: function() {
            that.text("Run");
            that.removeClass("disabled");
          }
        });
      });
      $("#close").click(function() {
        angular.element("#console").css("margin-left", "100%");
        if (player) player.editor.setReadOnly(true);
      });
      return player;
    }

    this.tryCode = function(enable, code) {
      if (enable) {
        if (typeof player === "undefined") {
          player = createPlayer();
        }
        player.editor.setValue(code, -1);
        player.editor.clearSelection();
        player.clearOutput();
        angular.element("#console").css("margin-left", "50%");
      } else {
        angular.element("#console").css("margin-left", "100%");
      }
      if (typeof player !== "undefined") {
        player.editor.setReadOnly(!enable);
      }
    };
  }


  angular.module('docascode.csplayService', ['docascode.constants', 'docascode.util'])
    .service('csplayService', ['$q', '$http', 'docConstants', 'docUtility', provider]);

})();
(function() {
  'use strict';
   /*jshint validthis:true */
  function provider($q, $http, docConstants, docUtility) {
    function normalizeUrl(url) {
      if (!url) return '';
      var arr = url.split(/[/|\\]/);
      var newArray = docUtility.cleanArray(arr);
      return newArray.join('/');
    }

    this.isAbsoluteUrl = function(url) {
      if (!url) return false;
      var r = new RegExp('^(?:[a-z]+:)?//', 'i');
      return r.test(url);
    };

    this.normalizeUrl = normalizeUrl;

    this.getRemoteUrl = function(item, startLine) {
      if (item && item.remote && item.remote.repo) {
        var repo = item.remote.repo;
        if (repo.substr(-4) === '.git') {
          repo = repo.substr(0, repo.length - 4);
        }
        var linenum = startLine ? startLine : item.startLine;
        if (repo.match(/https:\/\/.*\.visualstudio\.com\/.*/g)) {
          // TODO: line not working for vso
          return repo + '#path=/' + item.path + '&line=' + linenum;
        }
        if (repo.match(/https:\/\/.*github\.com\/.*/g)) {
          return repo + '/blob' + '/' + item.remote.branch + '/' + item.path + '/#L' + linenum;
        }
      } else {
        return "#";
      }
    };

    this.setItemTypeVisiblity = function(itemTypes, items) {
      for (var prop in itemTypes) {
        itemTypes[prop].show = false;
      }
      if (!items) return itemTypes;
      items.forEach(function(e) {
        if (itemTypes[e.type] && !itemTypes[e.type].show) itemTypes[e.type].show = true;
      });
      return itemTypes;
    };

    this.getPathInfo = function(currentPath) {
      if (!currentPath) return '';
      currentPath = normalizeUrl(currentPath);

      // seperate toc and content with !
      var index = currentPath.indexOf(docConstants.TocAndFileUrlSeperator);
      if (index < 0) {
        // If it ends with .md/.yml, render it without toc
        if ((docConstants.MdOrYamlRegexExp).test(currentPath)) {
          return {
            contentPath: currentPath
          };
        } else {
          return {
            tocPath: currentPath,
            tocFilePath: currentPath + '/' + docConstants.TocFile
          };
        }
      }

      return {
        tocPath: currentPath.substring(0, index),
        tocFilePath: currentPath.substring(0, index) + '/' + docConstants.TocFile,
        contentPath: currentPath.substring(index + 1, currentPath.length)
      };
    };

    this.getContentFilePath = function(pathInfo) {
      if (!pathInfo) return '';
      var path = pathInfo.tocPath ? pathInfo.tocPath + '/' : '';
      path += pathInfo.contentPath ? pathInfo.contentPath : docConstants.TocFile;
      return path;
    };

    this.getContentUrl = function(pathInfo) {
      if (!pathInfo) return pathInfo;
      var path = pathInfo.tocPath ? pathInfo.tocPath + docConstants.TocAndFileUrlSeperator : '';
      path += pathInfo.contentPath ? pathInfo.contentPath : docConstants.TocFile;
      return path;
    };

    this.getContentUrlWithTocAndContentUrl = function(tocPath, contentPath) {
      var path = tocPath ? tocPath + docConstants.TocAndFileUrlSeperator : '';
      path += contentPath ? contentPath : docConstants.TocFile;
      return path;
    };

    this.getPathInfoFromContentPath = function(navList, path) {
      // normalize path
      path = normalizeUrl(path);
      if (!navList || navList.length === 0) return {
        contentPath: path
      };

      for (var i = 0; i < navList.length; i++) {
        var href = navList[i].href;
        href = normalizeUrl(href) + '/'; // Append '/'' so that it must be a full path
        // return the first matched nav
        if (path.indexOf(href) === 0) {
          return {
            tocPath: href,
            tocFilePath: href + docConstants.TocFile,
            contentPath: path.replace(href, ''),
          };
        }
      }

      return {
        contentPath: path
      };
    };

    this.getAbsolutePath = function(currentUrl, relative) {
      var pathInfo = this.getPathInfo(currentUrl);
      if (!pathInfo) return '';
      var current = this.getContentFilePath(pathInfo);
      var sep = '/',
        currentList = docUtility.cleanArray(current.split(sep)),
        relList = docUtility.cleanArray(relative.split(sep)),
        fileName = currentList.pop();

      var relPath = currentList;
      while (relList.length > 0) {
        var pathPart = relList.shift();
        if (pathPart === '..') {
          if (relPath.length > 0) {
            relPath.pop();
          } else {
            throw "invalid path: " + relative;
          }
        } else {
          relPath.push(pathPart);
        }
      }

      return relPath.join(sep);
    };

    this.asyncFetchIndex = function(path, success, fail) {
      var deferred = $q.defer();

      //deferred.notify();
      var req = {
        method: 'GET',
        url: path,
        headers: {
          'Content-Type': 'text/plain'
        }
      };
      $http.get(req.url, req)
        .success(
          function(result) {
            if (success) success(result);
            deferred.resolve();

          }).error(
          function(result) {
            if (fail) fail(result);
            deferred.reject();
          }
        );

      return deferred.promise;
    };

    this.getTocContent = function($scope, path, tocCache) {
      if (path) {
        path = normalizeUrl(path);
        var temp = tocCache.get(path);
        if (temp) {
          $scope.toc = temp;
        } else {
          $scope.toc = {
            path: path
          };
          this.asyncFetchIndex(path, function(result) {
            var content = jsyaml.load(result);
            var toc = {
              path: path,
              content: content
            };
            tocCache.put(path, toc);
            $scope.toc = toc;
          }, function() {
            var toc = {
              path: path,
            };
            tocCache.put(path, toc);
            $scope.toc = toc;
          });
        }
      } else {
        $scope.toc = undefined;
      }
    };

    this.getMdContent = function($scope, path, mdIndexCache) {
      if (!path) return;
      var pathInfo = this.getPathInfo(path);
      var mdPath = normalizeUrl((pathInfo.tocPath || '') + '/' + docConstants.MdIndexFile);

      if (mdPath) {
        var tempMdIndex = mdIndexCache.get(mdPath);
        if (tempMdIndex) {
          if (tempMdIndex) $scope.mdIndex = tempMdIndex;
        } else {
          this.asyncFetchIndex(mdPath, function(result) {
            tempMdIndex = jsyaml.load(result);
            // This is the md file path
            mdIndexCache.put(mdPath, tempMdIndex);
            $scope.mdIndex = tempMdIndex;
          });
        }
      } else {
        $scope.toc = undefined;
      }
    };

    this.getDefaultItem = function(array, action) {
      if (!action) return;
      if (array && array.length > 0) {
        return action(array[0]);
      }
    };

    this.getHref = function($scope, current, url) {
      if (this.isAbsoluteUrl(url)) return url;
      if (!url) return '';

      var path = this.getAbsolutePath(current, url);
      var pathInfo = this.getPathInfoFromContentPath($scope.navbar, path);

      return '#' + this.getContentUrl(pathInfo);
    };
  }

  angular.module('docascode.urlService', ['docascode.constants', 'docascode.util'])
    .service('urlService', ['$q', '$http', 'docConstants', 'docUtility', provider]);

})();
angular.module('docsApp', [
  'ngRoute',
  'ngSanitize',
  'itemTypes',

  'bootstrap',
  'ui.bootstrap',
  'ui.bootstrap.dropdown',
  
  'docascode.controller',
  'docascode.directives',
]);
var directive = {};

directive.runnableExample = ['$templateCache', '$document', function($templateCache, $document) {
  'use strict';
  var exampleClassNameSelector = '.runnable-example-file';
  var doc = $document[0];
  var tpl =
    '<nav class="runnable-example-tabs" ng-if="tabs">' +
    '  <a ng-class="{active:$index==activeTabIndex}"' +
    'ng-repeat="tab in tabs track by $index" ' +
    'href="" ' +
    'class="btn"' +
    'ng-click="setTab($index)">' +
    '    {{ tab }}' +
    '  </a>' +
    '</nav>';

  return {
    restrict: 'C',
    scope: true,
    controller: ['$scope', function($scope) {
      $scope.setTab = function(index) {
        var tab = $scope.tabs[index];
        $scope.activeTabIndex = index;
        $scope.$broadcast('tabChange', index, tab);
      };
    }],
    compile: function(element) {
      element.html(tpl + element.html());
      return function(scope, element) {
        var node = element[0];
        var examples = node.querySelectorAll(exampleClassNameSelector);
        var tabs = [],
          now = Date.now();
        angular.forEach(examples, function(child, index) {
          tabs.push(child.getAttribute('name'));
        });

        if (tabs.length > 0) {
          scope.tabs = tabs;
          scope.$on('tabChange', function(e, index, title) {
            angular.forEach(examples, function(child) {
              child.style.display = 'none';
            });
            var selected = examples[index];
            selected.style.display = 'block';
          });
          scope.setTab(0);
        }
      };
    }
  };
}];

directive.dropdownToggle =
  ['$document', '$location', '$window',
    function($document, $location, $window) {
      'use strict';
      var openElement = null,
        close;
      return {
        restrict: 'C',
        link: function(scope, element, attrs) {
          scope.$watch(function dropdownTogglePathWatch() {
            return $location.path();
          }, function dropdownTogglePathWatchAction() {
            if (close) close();
          });

          element.parent().on('click', function(event) {
            if (close) close();
          });

          element.on('click', function(event) {
            event.preventDefault();
            event.stopPropagation();

            var iWasOpen = false;

            if (openElement) {
              iWasOpen = openElement === element;
              close();
            }

            if (!iWasOpen) {
              element.parent().addClass('open');
              openElement = element;

              close = function(event) {
                if (event) event.preventDefault();
                if (event) event.stopPropagation();
                $document.off('click', close);
                element.parent().removeClass('open');
                close = null;
                openElement = null;
              };

              $document.on('click', close);
            }
          });
        }
      };
    }
  ];

directive.syntax = function() {
  'use strict';
  return {
    restrict: 'A',
    link: function(scope, element, attrs) {
      function makeLink(type, text, link, icon) {
        return '<a href="' + link + '" class="btn syntax-' + type + '" target="_blank" rel="nofollow">' +
          '<span class="' + icon + '"></span> ' + text +
          '</a>';
      }

      var html = '';
      var types = {
        'github': {
          text: 'View on Github',
          key: 'syntaxGithub',
          icon: 'icon-github'
        },
        'plunkr': {
          text: 'View on Plunkr',
          key: 'syntaxPlunkr',
          icon: 'icon-arrow-down'
        },
        'jsfiddle': {
          text: 'View on JSFiddle',
          key: 'syntaxFiddle',
          icon: 'icon-cloud'
        }
      };
      for (var type in types) {
        var data = types[type];
        var link = attrs[data.key];
        if (link) {
          html += makeLink(type, data.text, link, data.icon);
        }
      }

      var nav = document.createElement('nav');
      nav.className = 'syntax-links';
      nav.innerHTML = html;

      var node = element[0];
      var par = node.parentNode;
      par.insertBefore(nav, node);
    }
  };
};

directive.tabbable = function() {
  'use strict';
  return {
    restrict: 'C',
    compile: function(element) {
      var navTabs = angular.element('<ul class="nav nav-tabs"></ul>'),
        tabContent = angular.element('<div class="tab-content"></div>');

      tabContent.append(element.contents());
      element.append(navTabs).append(tabContent);
    },
    controller: ['$scope', '$element', function($scope, $element) {
      var navTabs = $element.contents().eq(0),
        ngModel = $element.controller('ngModel') || {},
        tabs = [],
        selectedTab;

      ngModel.$render = function() {
        var $viewValue = this.$viewValue;

        if (selectedTab ? (selectedTab.value !== $viewValue) : $viewValue) {
          if (selectedTab) {
            selectedTab.paneElement.removeClass('active');
            selectedTab.tabElement.removeClass('active');
            selectedTab = null;
          }
          if ($viewValue) {
            for (var i = 0, ii = tabs.length; i < ii; i++) {
              if ($viewValue === tabs[i].value) {
                selectedTab = tabs[i];
                break;
              }
            }
            if (selectedTab) {
              selectedTab.paneElement.addClass('active');
              selectedTab.tabElement.addClass('active');
            }
          }

        }
      };

      this.addPane = function(element, attr) {
        var li = angular.element('<li><a href></a></li>'),
          a = li.find('a'),
          tab = {
            paneElement: element,
            paneAttrs: attr,
            tabElement: li
          };

        tabs.push(tab);

        function update() {
          tab.title = attr.title;
          tab.value = attr.value || attr.title;
          if (!ngModel.$setViewValue && (!ngModel.$viewValue || tab === selectedTab)) {
            // we are not part of angular
            ngModel.$viewValue = tab.value;
          }
          ngModel.$render();
        }

        attr.$observe('value', update)();
        attr.$observe('title', function() {
          update();
          a.text(tab.title);
        })();

        navTabs.append(li);
        li.on('click', function(event) {
          event.preventDefault();
          event.stopPropagation();
          if (ngModel.$setViewValue) {
            $scope.$apply(function() {
              ngModel.$setViewValue(tab.value);
              ngModel.$render();
            });
          } else {
            // we are not part of angular
            ngModel.$viewValue = tab.value;
            ngModel.$render();
          }
        });

        return function() {
          tab.tabElement.remove();
          for (var i = 0, ii = tabs.length; i < ii; i++) {
            if (tab === tabs[i]) {
              tabs.splice(i, 1);
            }
          }
        };
      };
    }]
  };
};

directive.table = function() {
  'use strict';
  return {
    restrict: 'E',
    link: function(scope, element, attrs) {
      if (!attrs['class']) {
        element.addClass('table table-bordered table-striped code-table');
      }
    }
  };
};

var popoverElement = function() {
  'use strict';
  var object = {
    init: function() {
      this.element = angular.element(
        '<div class="popover popover-incode top">' +
        '<div class="arrow"></div>' +
        '<div class="popover-inner">' +
        '<div class="popover-title"><code></code></div>' +
        '<div class="popover-content"></div>' +
        '</div>' +
        '</div>'
      );
      this.node = this.element[0];
      this.element.css({
        'display': 'block',
        'position': 'absolute'
      });
      angular.element(document.body).append(this.element);

      var inner = this.element.children()[1];
      this.titleElement = angular.element(inner.childNodes[0].firstChild);
      this.contentElement = angular.element(inner.childNodes[1]);

      //stop the click on the tooltip
      this.element.on('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
      });

      var self = this;
      angular.element(document.body).on('click', function(event) {
        if (self.visible()) self.hide();
      });
    },

    show: function(x, y) {
      this.element.addClass('visible');
      this.position(x || 0, y || 0);
    },

    hide: function() {
      this.element.removeClass('visible');
      this.position(-9999, -9999);
    },

    visible: function() {
      return this.position().y >= 0;
    },

    isSituatedAt: function(element) {
      return this.besideElement ? element[0] === this.besideElement[0] : false;
    },

    title: function(value) {
      return this.titleElement.html(value);
    },

    content: function(value) {
      if (value && value.length > 0) {
        value = marked(value);
      }
      return this.contentElement.html(value);
    },

    positionArrow: function(position) {
      this.node.className = 'popover ' + position;
    },

    positionAway: function() {
      this.besideElement = null;
      this.hide();
    },

    positionBeside: function(element) {
      this.besideElement = element;

      var elm = element[0];
      var x = elm.offsetLeft;
      var y = elm.offsetTop;
      x -= 30;
      y -= this.node.offsetHeight + 10;
      this.show(x, y);
    },

    position: function(x, y) {
      if (x != null && y != null) {
        this.element.css('left', x + 'px');
        this.element.css('top', y + 'px');
      } else {
        return {
          x: this.node.offsetLeft,
          y: this.node.offsetTop
        };
      }
    }
  };

  object.init();
  object.hide();

  return object;
};

directive.popover = ['popoverElement', function(popover) {
  'use strict';
  return {
    restrict: 'A',
    priority: 500,
    link: function(scope, element, attrs) {
      element.on('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        if (popover.isSituatedAt(element) && popover.visible()) {
          popover.title('');
          popover.content('');
          popover.positionAway();
        } else {
          popover.title(attrs.title);
          popover.content(attrs.content);
          popover.positionBeside(element);
        }
      });
    }
  };
}];

directive.tabPane = function() {
  'use strict';
  return {
    require: '^tabbable',
    restrict: 'C',
    link: function(scope, element, attrs, tabsCtrl) {
      element.on('$remove', tabsCtrl.addPane(element, attrs));
    }
  };
};

directive.foldout = ['$http', '$animate', '$window', function($http, $animate, $window) {
  'use strict';
  return {
    restrict: 'A',
    priority: 500,
    link: function(scope, element, attrs) {
      var container, loading, url = attrs.url;
      if (/\/build\//.test($window.location.href)) {
        url = '/build/docs' + url;
      }
      element.on('click', function() {
        scope.$apply(function() {
          if (!container) {
            if (loading) return;

            loading = true;
            var par = element.parent();
            container = angular.element('<div class="foldout">loading...</div>');
            $animate.enter(container, null, par);

            $http.get(url, {
              cache: true
            }).success(function(html) {
              loading = false;

              html = '<div class="foldout-inner">' +
                '<div calss="foldout-arrow"></div>' +
                html +
                '</div>';
              container.html(html);

              //avoid showing the element if the user has already closed it
              if (container.css('display') === 'block') {
                container.css('display', 'none');
                $animate.addClass(container, 'ng-hide');
              }
            });
          } else {
            if (container.hasClass('ng-hide')) $animate.removeClass(container, 'ng-hide');
            else $animate.addClass(container, 'ng-hide');
          }
        });
      });
    }
  };
}];

angular.module('bootstrap', [])
  .directive(directive)
  .factory('popoverElement', popoverElement)
  .run(function() {
    marked.setOptions({
      gfm: true,
      tables: true
    });
  });
(function() {
    'use strict';
     /*jshint validthis:true */
    function provider() {
        this.YamlExtension = '.yml';
        this.MdExtension = '.md';
        this.TocYamlRegexExp = /toc\.yml$/;
        this.YamlRegexExp = /\.yml$/;
        this.MdRegexExp = /\.md$/;
        this.MdOrYamlRegexExp = /(\.yml$)|(\.md$)/;
        this.MdIndexFile = 'md' + this.YamlExtension;
        this.TocFile = 'toc' + this.YamlExtension; // docConstants.TocFile
        this.TocAndFileUrlSeperator = '!'; // docConstants.TocAndFileUrlSeperator
    }

    angular.module('docascode.constants', [])
        .service('docConstants', provider);

})();
(function() {
  'use strict';

  angular.module('docascode.controller', ['docascode.contentService', 'docascode.urlService', 'docascode.directives', 'docascode.constants'])
    .controller('DocsController', [
      '$scope', '$location', 'NG_ITEMTYPES', 'contentService', 'urlService', 'docConstants',
      DocsCtrl
    ]);

  function DocsCtrl($scope, $location, NG_ITEMTYPES, contentService, urlService, docConstants) {

    /**********************************
     Initialize
     **********************************/

    $scope.versionNumber = angular.version.full;
    $scope.version = angular.version.full + "  " + angular.version.codeName;
    $scope.loading = 0;
    $scope.docsVersion = 'latest';
    $scope.tocClass = tocClass;
    $scope.navClass = navClass;

    $scope.expandAll = expandAll;
    $scope.getViewSourceHref = getViewSourceHref;
    $scope.getTocHref = getTocHref;
    $scope.getBreadCrumbHref =getBreadCrumbHref;
    $scope.getNavHref = getNavHref;
    $scope.getLinkHref = getLinkHref;
    $scope.filteredItems = filteredItems;
    $scope.getNumber = function(num) { return new Array(num + 1); };

    /****************************************
     element ng-class related Implementation
     ****************************************/
    function tocClass(navItem) {
      /* jshint validthis: true */
      var current = {
        current: navItem.href && this.pathInfo.contentPath === navItem.href,
        'nav-index-section': navItem.type === 'section'
      };
      if (current.current === true) {
        $scope.navGroup = this.navGroup;
        $scope.navItem = this.navItem;
      }

      return current;
    }

    function navClass(navItem) {
      /* jshint validthis: true */
      var navPath;
      if (this.pathInfo) {
        navPath = urlService.normalizeUrl(this.pathInfo.tocPath || this.pathInfo.contentPath);
      }

      var current = {
        current: navPath && navPath === navItem.href,
      };

      if (current.current === true){
        $scope.currentNavItem = navItem;
      }
      return current;
    }

    /**************************************
     element button related Implementation
     **************************************/
    function getViewSourceHref(){
      /* jshint validthis: true */
      return urlService.getRemoteUrl(this.model.source, this.model.source.startLine + 1);
    }

    // expand / collapse all logic for model items
    function expandAll(state) {
      var partialModel = $scope.partialModel? $scope.partialModel.model : null;
      if (partialModel && partialModel.items) {
        partialModel.items.forEach(function(e) {
          e.showDetail = state;
        });
      }
    }

    // Href relative to current toc file
    function getTocHref(url) {
      if (!$scope.toc) return '';
      return urlService.getHref($scope, $scope.toc.path, url);
    }

    // Href relative to current toc file
    function getBreadCrumbHref(url) {
      // For navbar url, no need to calculate relative path from toc
      if (url && url.indexOf('/#/') === 0) return url;
      if (!$scope.toc) return '';
      return urlService.getHref($scope, $scope.toc.path, url);
    }

    function getNavHref(url) {
      if (urlService.isAbsoluteUrl(url)) return url;
      if (!url) return '';
      return '#' + url;
    }

    // Href relative to current file
    function getLinkHref(url) {
      return urlService.getHref($scope, $location.path(), url);
    }

    function filterNavItem(name, text) {
      if (!text) return true;
      if (name.toLowerCase().indexOf(text.toLowerCase()) > -1) return true;
      return false;
    }

    function filteredItems(f) {
      /* jshint validthis: true */
      var globalVisible = !f;
      this.model.forEach(function(a, i, o) {
        // show namespace if any of its child is visible
        // show all the children if the namespace is visible
        var firstLevelTocName = a.uid || a.name;
        var hide = !globalVisible && !filterNavItem(firstLevelTocName, f);
        var tempHide = hide;
        if (a.items){
          a.items.forEach(function(a1, i1, o1){
            // support firstLevel.lastLevel format seach
            var lastLevelFullName = firstLevelTocName + '.' + a1.name;
            a1.hide = tempHide && !filterNavItem(lastLevelFullName, f);
            if (!a1.hide){
              // show firstLevel if any of its children is visible
              hide = false;
            }
          });
        }

        a.hide = hide;
      });
    }

    contentService.getNavBar().then(function(data) {
      $scope.navbar = data;
      contentService.getDefaultItem($scope.navbar,
          function(defaultItem) {
            if (!$location.path() && defaultItem.href) $location.url(defaultItem.href);
          });
    });

    // #a/b/c!d/e/f => a/b/c/toc.yml as toc, d/e/f as content
    $scope.$watch(function docsPathWatch() {
      return $location.path();
    }, function docsPathWatchAction(path) {
      path = path.replace(/^\/?(.+?)(\/index)?\/?$/, '$1');
      $scope.navGroup = null;
      $scope.navItem = null;
      $scope.currentNavItem = null;
      $scope.tocPage = false;
      if ($scope.partialModel) $scope.partialPath = null;
      var currentPage = $scope.currentPage = path; //NG_PAGES[path];
      // TODO: check if it is inside NG_PAGES
      // If current page exists in NG_PAGES
      if (currentPage) {
        var pathInfo = urlService.getPathInfo(currentPage);
        $scope.pathInfo = pathInfo;
        contentService.getTocContent(pathInfo.tocFilePath).then(
          function(data){
            $scope.toc = data;
          });

        path = urlService.getContentFilePath(pathInfo);
        if (path) {
          // If is toc.yml and home page exists, set to $scope and return
          // TODO: refactor using ngRoute
          if ((docConstants.TocYamlRegexExp).test(path)){
            $scope.tocPage = true;
            if (loadHomepage($scope.currentNavItem)) return;
          }

          // If end with .md
          if ((docConstants.MdRegexExp).test(path)) {
            $scope.contentType = 'md';

            var partialModel = {
              path: path,
              title: path,
            };

            $scope.partialModel = partialModel;
          } else if ((docConstants.YamlRegexExp).test(path)) {
            $scope.contentType = 'yaml';
            // if is yaml
            // 1. try get md.yaml from the same path as toc, or current path if toc is not there
            contentService.getMdContent(currentPage).then(function(data){
              $scope.mdIndex = data;
            });

            contentService.getContent(path).then(function(data) {
                $scope.partialModel = partialModelHandler(data);
              }).catch(
              function() {
                $scope.partialModel = {
                  path : 'template/error404.tmpl',
                };
                $scope.breadcrumb = [];
              }
            );
          } else {
            // If not md or yaml, simply try load the path
            $scope.partialPath = path;
          }
        }
      } else {
        if ($scope.navbar && $scope.navbar.length > 0) {
          $location.url($scope.navbar[0].href);
        }
      }
    });

    function loadHomepage(navItem){
      if (!navItem || !navItem.homepage || !$scope.tocPage) return false;
      if (!$scope.partialModel) $scope.partialModel = {};
      $scope.partialModel.path = navItem.homepage;
      $scope.contentType = 'md';
      return true;
    }

    function partialModelHandler(data) {
      var partialModel = {
        model: undefined,
        path: undefined,
        title: undefined,
        itemtypes: undefined,
      };
      if (data instanceof Array) {
        // toc list
        partialModel.path = 'template' + '/tocpage.tmpl';
        partialModel.model = data;
      } else {
        var items = data.items;
        var references = data.references || [];

        // TODO: what if items are not in order? what if items are not arranged as expected, e.g. multiple namespaces in one yml?
        var item = items[0];
        references = items.slice(1).concat(references || []);
        if (item.children){
          var children = [];
          for(var i = 0, l = item.children.length; i < l; i++) {
            var matched = references.filter(getItemWithSameUidFunction(item.children[i]))[0] || {};
            if (matched.uid){
              children.push(matched);
            }
          }
          item.items = children;
        }

        partialModel.model = item;
        partialModel.title = item.name;
        if (item.type.toLowerCase() === 'namespace') {
          partialModel.itemtypes = urlService.setItemTypeVisiblity(NG_ITEMTYPES.namespace, item.items);
          partialModel.path = 'template' + '/namespace.tmpl';
        } else {
          partialModel.itemtypes = urlService.setItemTypeVisiblity(NG_ITEMTYPES.class, item.items);
          partialModel.path = 'template' + '/class.tmpl';
        }
      }
      return partialModel;
    }

    function getItemWithSameUidFunction(child){
      return function(x) {
              return x.uid === child;
            };
    }

    function getMdItemIndex(item, tocPath, mdPath, mdInitial, mdResolved) {
      var itemHref = (tocPath || '') + '/' + item.href;
      return contentService.getMarkdownContent(itemHref).then(
        function(res) {
          var snippet = res;
          var startLine = item.referenceStartLine ? item.referenceStartLine : 1;
          var lines = snippet.split('\n');
          var endLine = item.referenceEndLine ? item.referenceEndLine : lines.length;
          snippet = "";
          for (var i = startLine - 1; i < endLine; i++) {
            snippet += lines[i] + '\n';
          }
          return mdResolved.replace(mdInitial.substr(item.startLine - mdPath.startLine, item.endLine - item.startLine + 1), snippet);
        });
    }

    function makeThenFunction(item, tocPath, mdPath, mdInitial){
      return function(md){ return getMdItemIndex(item, tocPath, mdPath, mdInitial, md);};
    }
    // TODO: move to directive?
    // BUG? method's binding works? looks like not
    function mdIndexWatcher(path) {
        if ($scope.mdIndex && $scope.partialModel) {
          var partialModel = $scope.partialModel.model;
          if (partialModel){
            var mdPath = $scope.mdIndex[partialModel.id];
            if (mdPath) {
                if (mdPath.href) {
                    partialModel.mdHref = urlService.getRemoteUrl(mdPath);
                    var tocPath = urlService.getPathInfo($location.path()).tocPath;
                    var href = (tocPath || '') + '/' + mdPath.href;
                    var getMdIndex = contentService.getMarkdownContent(href).then(
                      function(result) {
                          var md = result.substr(mdPath.startLine, mdPath.endLine - mdPath.startLine + 1);
                          if (mdPath.items) {
                              var promise = contentService.valueHttpWrapper(md);
                              for (var i = 0; i < mdPath.items.length; i++) {
                                  var item = mdPath.items[i];
                                  promise = promise.then(makeThenFunction(item, tocPath, mdPath, md));
                              }
                              promise.then(function(md){
                                partialModel.mdContent = md;
                              });
                          }
                          else{
                              partialModel.mdContent = md;
                          }
                      });
                }
            }
          }
        }
    }

    function breadCrumbWatcher(currentGroup, currentPage, currentNavItem) {
      // breadcrumb generation logic
      var breadcrumb = $scope.breadcrumb = [];

      if (currentNavItem) {
        breadcrumb.push({
          name: currentNavItem.name,
          // use '/#/' to indicate this is a nav link...
          url: '/#/' + currentNavItem.href
        });
      }
      if (currentGroup) {
        breadcrumb.push({
          name: currentGroup.uid || currentGroup.name,
          url: currentGroup.href
        });

        // If toc does not exist, use navbar's title
        if (currentPage) {
          breadcrumb.push({
            name: currentPage.name,
            url: currentPage.href
          });
        }
      }
    }

    $scope.$watch(function modelWatch() {
      return $scope.partialModel;
    }, function() {
      mdIndexWatcher();
      breadCrumbWatcher($scope.navGroup, $scope.navItem, $scope.currentNavItem);
      loadHomepage($scope.currentNavItem);
    });

    $scope.$watch(function modelWatch() {
      return $scope.currentNavItem;
    }, function(navbar) {
      breadCrumbWatcher($scope.navGroup, $scope.navItem, $scope.currentNavItem);
    });

    $scope.$watch(function modelWatch() {
      return $scope.navGroup;
    }, function(navGroup) {
      breadCrumbWatcher(navGroup, $scope.navItem, $scope.currentNavItem);
    });

    $scope.$watch(function modelWatch() {
      return $scope.navItem;
    }, function(navItem) {
      breadCrumbWatcher($scope.navGroup, navItem, $scope.currentNavItem);
    });

    $scope.$watch(function modelWatch() {
      return $scope.mdIndex;
    }, mdIndexWatcher);

    // listen for toc change
    $scope.$watch(function modelWatch() {
      return $scope.navbar;
    }, function modelWatchAction(navbar) {
      if (!$location.path() && navbar && navbar.count > 0) {
        $location.url(navbar[0].href);
      }
    });

    $scope.$watch(function modelWatch() {
      return $scope.currentNavItem;
    }, loadHomepage);
  }

})();
(function() {
  'use strict';

  angular.module('docascode.directives', ['docascode.urlService', 'docascode.csplayService'])
    /**
     * backToTop Directive
     * @param  {Function} $anchorScroll
     *
     * @description Ensure that the browser scrolls when the anchor is clicked
     */
    .directive('backToTop', ['$anchorScroll', '$location', function($anchorScroll, $location) {
      return function link(scope, element) {
        element.on('click', function(event) {
          $location.hash('');
          scope.$apply($anchorScroll);
        });
      };
    }])
    .directive('scrollYOffsetElement', ['$anchorScroll', function($anchorScroll) {
      return function(scope, element) {
        $anchorScroll.yOffset = element;
      };
    }])
    .directive('markdown', ['csplayService', 'urlService', '$location', function(csplayService, urlService, $location) {
      var md = (function() {
        marked.setOptions({
          gfm: true,
          pedantic: false,
          sanitize: true
        });

        var toHtml = function(markdown) {
          if (!markdown)
            return '';

          return marked(markdown);
        };
        return {
          toHtml: toHtml
        };
      }());
      return {
        restrict: 'AE',
        link: function(scope, element, attrs) {
          function set(val) {
            var html = md.toHtml(val);
            element.html(html);
            angular.forEach(element.find("code"), function(block) {
              // use highlight.js to highlight code
              hljs.highlightBlock(block);
              // Add try button
              block = block.parentNode;
              var wrapper = document.createElement("div");
              wrapper.className = "codewrapper";
              wrapper.innerHTML = '<div class="trydiv"><span class="tryspan">Try this code</span></div>';
              wrapper.childNodes[0].childNodes[0].onclick = function() {
                csplayService.tryCode(true, block.innerText);
              };
              block.parentNode.replaceChild(wrapper, block);
              wrapper.appendChild(block);
            });
            angular.forEach(element.find("a"), function(block) {
              var url = block.attributes['href'] && block.attributes['href'].value;
              if (!url) return;
              if (!urlService.isAbsoluteUrl(url))
                block.attributes['href'].value = urlService.getHref(scope, $location.path(), url);
            });
            angular.forEach(element.find("img"), function(block) {
              var url = block.attributes['src'] && block.attributes['src'].value;
              if (!url) return;
              if (!urlService.isAbsoluteUrl(url))
                block.attributes['src'].value = urlService.getAbsolutePath($location.path(), url);
            });
          }

          set(element.text() || '');
          if (attrs.ngModel) {
            var unwatch = scope.$watch(attrs.ngModel, function(value, oldValue) {
              if (value === undefined) return;
              set(value);
              unwatch();
            });
          }
        }
      };
    }])
    .directive('code', function() {
      return {
        restrict: 'E',
        terminal: true,
        link: function(scope, element, attrs) {
          var unwatch = scope.$watch(attrs.ngModel, function(value, oldValue) {
            if (value === undefined) return;
            var language;
            var content;
            if (value.CSharp) {
              language = "csharp";
              content = value.CSharp;
            }else if (value.VB) {
              language = "vb";
              content = value.VB;
            }

            element.text(content);
            angular.forEach(element, function(block) {
              hljs.highlightBlock(block, language);
            });
            unwatch();
          });
        }
      };
    });

})();
angular.module('errors', ['ngSanitize'])

.filter('errorLink', ['$sanitize', function($sanitize) {
  'use strict';
  var LINKY_URL_REGEXP = /((ftp|https?):\/\/|(mailto:)?[A-Za-z0-9._%+-]+@)\S*[^\s\.\;\,\(\)\{\}<>]/g,
    MAILTO_REGEXP = /^mailto:/,
    STACK_TRACE_REGEXP = /:\d+:\d+$/;

  var truncate = function(text, nchars) {
    if (text.length > nchars) {
      return text.substr(0, nchars - 3) + '...';
    }
    return text;
  };

  return function(text, target) {
    var targetHtml = target ? ' target="' + target + '"' : '';

    if (!text) return text;

    return $sanitize(text.replace(LINKY_URL_REGEXP, function(url) {
      if (STACK_TRACE_REGEXP.test(url)) {
        return url;
      }

      // if we did not match ftp/http/mailto then assume mailto
      if (!/^((ftp|https?):\/\/|mailto:)/.test(url)) url = 'mailto:' + url;

      return '<a' + targetHtml + ' href="' + url + '">' +
        truncate(url.replace(MAILTO_REGEXP, ''), 60) +
        '</a>';
    }));
  };
}])


.directive('errorDisplay', ['$location', 'errorLinkFilter', function($location, errorLinkFilter) {
  'use strict';
  var interpolate = function(formatString) {
    var formatArgs = arguments;
    return formatString.replace(/\{\d+\}/g, function(match) {
      // Drop the braces and use the unary plus to convert to an integer.
      // The index will be off by one because of the formatString.
      var index = +match.slice(1, -1);
      if (index + 1 >= formatArgs.length) {
        return match;
      }
      return formatArgs[index + 1];
    });
  };

  return {
    link: function(scope, element, attrs) {
      var search = $location.search(),
        formatArgs = [attrs.errorDisplay],
        i;

      for (i = 0; angular.isDefined(search['p' + i]); i++) {
        formatArgs.push(search['p' + i]);
      }
      element.html(errorLinkFilter(interpolate.apply(null, formatArgs), '_blank'));
    }
  };
}]);
// Meta data used by the AngularJS docs app
angular.module('pagesData', [])
  .value('NG_PAGES', {});
// Order matters
angular.module('itemTypes', [])
  .value('NG_ITEMTYPES', {
    "class": {
      "Property": {
        "name": "Property",
        "description": "Properties",
        "show": false
      },
      "Method": {
        "name": "Method",
        "description": "Methods",
        "show": false
      },
      "Constructor": {
        "name": "Constructor",
        "description": "Constructors",
        "show": false
      },
      "Field": {
        "name": "Field",
        "description": "Fields",
        "show": false
      },
    },
    // [
    //   { "name": "Property", "description": "Property" },
    //   { "name": "Method" , "description": "Method"},
    //   { "name": "Constructor" , "description": "Constructor"},
    //   { "name": "Field" , "description": "Field"},
    // ],
    "namespace": {
      "Class": {
        "name": "Class",
        "description": "Classes",
        "show": false
      },
      "Enum": {
        "name": "Enum",
        "description": "Enums",
        "show": false
      },
      "Delegate": {
        "name": "Delegate",
        "description": "Delegates",
        "show": false
      },
      "Interface": {
        "name": "Interface",
        "description": "Interfaces",
        "show": false
      },
      "Struct": {
        "name": "Struct",
        "description": "Structs",
        "show": false
      },
    },
    // [

    //   { "name": "Class", "description": "Class" },
    //   { "name": "Enum" , "description": "Enum"},
    //   { "name": "Delegate" , "description": "Delegate"},
    //   { "name": "Struct" , "description": "Struct"},
    //   { "name": "Interface", "description": "Interface" },
    // ]
  });
(function() {
  'use strict';
  /*jshint validthis:true */
  function utilityProvider() {
    this.cleanArray = function(actual) {
      var newArray = [];
      for (var i = 0; i < actual.length; i++) {
        if (actual[i]) {
          newArray.push(actual[i]);
        }
      }
      return newArray;
    };
  }

  angular.module('docascode.util', [])
    .service('docUtility', utilityProvider);
})();
// Meta data used by the AngularJS docs app
angular.module('versionsData', [])
  .value('NG_VERSION', {
    "raw": "1.0.0",
    "major": 1,
    "minor": 0,
    "patch": 0,
    "prerelease": [
      "local"
    ],
    "build": "sha.8200011",
    "version": "1.0.0-master",
    "branch": "master"
  })
  .value('NG_VERSIONS', [{
    "raw": "1.0.0",
    "major": 1,
    "minor": 0,
    "patch": 0,
    "prerelease": [
      "local"
    ],
    "build": "sha.8200011",
    "version": "1.0.0-master",
    "branch": "master"
  }]);
angular.module('versions', [])

.controller('DocsVersionsCtrl', ['$scope', '$location', '$window', 'NG_VERSIONS', function($scope, $location, $window, NG_VERSIONS) {
  'use strict';
  $scope.docs_version = NG_VERSIONS[0];
  $scope.docs_versions = NG_VERSIONS;

  for (var i = 0, minor = NaN; i < NG_VERSIONS.length; i++) {
    var version = NG_VERSIONS[i];
    // NaN will give false here
    if (minor <= version.minor) {
      continue;
    }
    version.isLatest = true;
    minor = version.minor;
  }

  $scope.getGroupName = function(v) {
    return v.isLatest ? 'Latest' : ('v' + v.major + '.' + v.minor + '.x');
  };

  $scope.jumpToDocsVersion = function(version) {
    var currentPagePath = $location.path().replace(/\/$/, '');

    // TODO: We need to do some munging of the path for different versions of the API...


    $window.location = version.docsUrl + currentPagePath;
  };
}]);