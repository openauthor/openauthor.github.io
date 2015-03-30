function docsConstantsProvider(){
  this.TocFile = 'toc.yaml'; // docConstants.TocFile
  this.TocAndFileUrlSeperator = '!'; // docConstants.TocAndFileUrlSeperator
}

angular.module('docConstants', [])
.service('docConstants', docsConstantsProvider);
function utilityProvider() {
  this.cleanArray = function(actual) {
    'use strict';
    var newArray = [];
    for (var i = 0; i < actual.length; i++) {
      if (actual[i]) {
        newArray.push(actual[i]);
      }
    }
    return newArray;
  };
}

angular.module('docUtility', [])
  .service('docUtility', utilityProvider);
angular.module('directives', [])
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
  }]);
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
function docServiceFunction($q, $http, docConstants, docUtility) {

  function normalizeUrl(url){
    if (!url) return '';
    var arr = url.split(/[/|\\]/);
    var newArray = docUtility.cleanArray(arr);
    return newArray.join('/');
  }

  this.isAbsoluteUrl = function(url){
    if (!url) return false;
    var r = new RegExp('^(?:[a-z]+:)?//', 'i');
    return r.test(url);
  };

  this.tocClassApi = function(navItem) {
    return {
      active: navItem.href && this.pathInfo && this.pathInfo.contentPath,
      current: this.pathInfo.contentPath === navItem.href,
      'nav-index-section': navItem.type === 'section'
    };
  };

  this.gridClassApi = function(toc) {
    return {
      'grid-right': toc,
      grid: !toc
    };
  };

  this.navClassApi = function(navItem) {
    var navPath;
    if (this.pathInfo) {
      navPath = normalizeUrl(this.pathInfo.tocPath || this.pathInfo.contentPath);
    }

    return {
      active: navItem.href && navPath,
      current: navPath === navItem.href,
    };
  };

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
      // If it ends with .md/.yaml, render it without toc
      if ((/(\.yaml$)|(\.md$)/g).test(currentPath)) {
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

  this.getPathInfoFromContentPath = function(navList, path){
    // normalize path
    path = normalizeUrl(path);
    if (!navList || navList.length === 0) return {contentPath: path};

    for (var i = 0; i < navList.length; i++){
      var href = navList[i].href;
      href = normalizeUrl(href) + '/'; // Append '/'' so that it must be a full path
      // return the first matched nav
      if (path.startsWith(href)){
        return {
              tocPath: href,
              tocFilePath: href + docConstants.TocFile,
              contentPath: path.replace(href, ''),
            };
      }
    }

    return {contentPath: path};
  };

  this. getAbsolutePath = function(currentUrl, relative){
    var pathInfo = this.getPathInfo(currentUrl);
    if (!pathInfo) return '';
    var current = this.getContentFilePath(pathInfo);
    var sep = '/',
      currentList = docUtility.cleanArray(current.split(sep)),
      relList = docUtility.cleanArray(relative.split(sep)),
      fileName = currentList.pop();

    var relPath = currentList;
    while (relList.length > 0){
      var pathPart = relList.shift();
      if (pathPart === '..'){
        if (relPath.length > 0){
          relPath.pop();
        }else{
          throw "invalid path: " + relative;
        }
      }else{
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

  this.getTocContent = function($scope, path, tocCache){
    if (path) {
      path = normalizeUrl(path);
      var temp = tocCache.get(path);
      if (temp) {
        $scope.toc = temp;
      } else {
        $scope.toc = {path: path};
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
    }else{
      $scope.toc = undefined;
    }
  };

  this.getMdContent = function($scope, path, mdIndexCache){
    if (!path) return;
    var pathInfo = this.getPathInfo(path);
    var mdPath = normalizeUrl((pathInfo.tocPath || '') + '/' + 'md.yaml');

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
    }else{
      $scope.toc = undefined;
    }
  };

  this.getDefaultItem = function(array, action) {
    if (!action) return;
    if (array && array.length > 0) {
      return action(array[0]);
    }
  };

  this.getHref = function($scope, current, url){
    if (this.isAbsoluteUrl(url)) return url;
    if (!url) return '';

    var path = this.getAbsolutePath(current, url);
    var pathInfo = this.getPathInfoFromContentPath($scope.navbar, path);

    return '#' + this.getContentUrl(pathInfo);
  };
}

angular.module('docInitService', ['docConstants', 'docUtility'])
  .service('docService', ['$q', '$http', 'docConstants', 'docUtility', docServiceFunction]);
function markdownServiceFunction() {
  function csplay(player, compileServiceBaseUrl) {
    'use strict';
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

  var player;

  function createPlayer() {
    'use strict';
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
    'use strict';
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

angular.module('directives', ['docInitService'])
  .service('docsMarkdownService', markdownServiceFunction)
  .directive('markdown', ['docsMarkdownService', 'docService', '$location', function(docsMarkdownService, docService, $location) {
    'use strict';
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
              docsMarkdownService.tryCode(true, block.innerText);
            };
            block.parentNode.replaceChild(wrapper, block);
            wrapper.appendChild(block);
          });
          angular.forEach(element.find("a"), function(block) {
            var url = block.attributes['href'] && block.attributes['href'].value;
            if (!url) return;
            if (!docService.isAbsoluteUrl(url))
              block.attributes['href'].value = docService.getHref(scope, $location.path(), url);
          });
          angular.forEach(element.find("img"), function(block) {
            var url = block.attributes['src'] && block.attributes['src'].value;
            if (!url) return;
            if (!docService.isAbsoluteUrl(url))
              block.attributes['src'].value = docService.getAbsolutePath($location.path(), url);
          });
        }

        set(element.text() || '');
        if(attrs.ngModel){
          scope.$watch(attrs.ngModel, function(value, oldValue) {
            set(value);
          });
        }

        if (attrs.markdown){
          scope.$watch('markdown', function(value, oldValue) {
            set(value);
          });
        }
      }
    };
  }])
  .directive("declaration", function() {
    return {
      restrict: 'E',
      link: function(scope, element, attrs) {
        scope.$watch(attrs.ngModel, function(value, oldValue) {
          var language = attrs.ngLanguage;
          element.html('<code class="lang-' + 'language' + '"></code>');
          var code = element.children("code");
          code.text(value);
          hljs.highlightBlock(code[0]);
        });
      }
    };
  })
  .directive('code', function() {
    return {
      restrict: 'E',
      terminal: true,
      compile: function(element) {
        var linenums = element.hasClass('linenum'); // || element.parent()[0].nodeName === 'PRE';
        var match = /lang-(\S+)/.exec(element[0].className);
        var lang = match && match[1];
        var html = element.html();
        element.html(window.prettyPrintOne(html, lang, linenums));
      }
    };
  });
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
var player;


angular.module('docsApp', [
  'ngRoute',
  'ngCookies',
  'ngSanitize',
  'ngAnimate',
  'docConstants',
  'docUtility',
  'docCtrl',
  'versionsData',
  'pagesData',
  'itemTypes',
  'directives',
  'errors',
  'versions',
  'bootstrap',
  'ui.bootstrap.dropdown',
]);

angular.module('docCtrl', ['docInitService', 'docUtility'])
  .factory('tocCache', ['$cacheFactory', function($cacheFactory) {
    return $cacheFactory('toc-cache');
  }])
  .factory('mdIndexCache', ['$cacheFactory', function($cacheFactory) {
    return $cacheFactory('mdIndex-cache');
  }])
  .controller('DocsController', [
    '$scope', '$http', '$q', '$rootScope', '$location', '$window', '$cookies',
    'NG_PAGES', 'NG_VERSION', 'NG_ITEMTYPES', 'docService', 'tocCache', 'mdIndexCache', 'docUtility',
    function($scope, $http, $q, $rootScope, $location, $window, $cookies,
      NG_PAGES, NG_VERSION, NG_ITEMTYPES, docService, tocCache, mdIndexCache, docUtility) {
      'use strict';

      $scope.docsVersion = NG_VERSION.isSnapshot ? 'snapshot' : NG_VERSION.version;

      $scope.tocClass = docService.tocClassApi;
      $scope.gridClass = docService.gridClassApi;

      $scope.navClass = docService.navClassApi;

      $scope.getNumber = function(num) {
        return new Array(num + 1);
      };

      $scope.GetDetail = function(e) {
        var display = e.target.nextElementSibling.style.display;
        e.target.nextElementSibling.style.display = (display === 'block') ? 'none' : 'block';
      };

      $scope.ViewSource = function() {
        return docService.getRemoteUrl(this.model.source, this.model.source.startLine + 1);
      };

      $scope.ImproveThisDoc = function() {
        return $scope.partialModel.mdContent;
      };

      // Href relative to current toc file
      $scope.GetTocHref = function(url) {
        if (!$scope.toc) return '';
        return docService.getHref($scope, $scope.toc.path, url);
      };

      $scope.GetNavHref = function(url) {
        if (docService.isAbsoluteUrl(url)) return url;
        if (!url) return '';
        return '#' + url;
      };

      // Href relative to current file
      $scope.GetLinkHref = function(url) {
        return docService.getHref($scope, $location.path(), url);
      };

      $scope.$on('$includeContentLoaded', function() {
        // Add post actions when ng-include updated
      });

      (function getNavbar() {
        // load navigation bar, should be toc.yaml in root path
        // TODO: support toc.md => extract <h><a> from marked(toc.md)
        var navBarPath = "toc.yaml";
        docService.asyncFetchIndex(navBarPath, function(result) {
          $scope.navbar = jsyaml.load(result);

          // Load first item as the default page
          docService.getDefaultItem($scope.navbar,
            function(defaultItem) {
              if (!$location.path() && defaultItem.href) $location.url(defaultItem.href);
            });
        });
      })();

      // #a/b/c!d/e/f => a/b/c/toc.yaml as toc, d/e/f as content
      $scope.$watch(function docsPathWatch() {
        return $location.path();
      }, function docsPathWatchAction(path) {
        path = path.replace(/^\/?(.+?)(\/index)?\/?$/, '$1');

        var currentPage = $scope.currentPage = path; //NG_PAGES[path];

        // TODO: check if it is inside NG_PAGES
        // If current page exists in NG_PAGES
        if (currentPage) {
          var pathInfo = docService.getPathInfo(currentPage);
          $scope.pathInfo = pathInfo;
          docService.getTocContent($scope, pathInfo.tocFilePath, tocCache);

          path = docService.getContentFilePath(pathInfo);
          if (path) {
            // If end with .md
            if ((/\.md$/g).test(path)) {
              $scope.contentType = 'md';
              $scope.partialModel = {};
              $scope.title = path;
              $scope.partialPath = path;
            } else if ((/\.yaml$/g).test(path)) {
              $scope.contentType = 'yaml';
              // if is yaml

              // 1. try get md.yaml from the same path as toc, or current path if toc is not there
              docService.getMdContent($scope, currentPage, mdIndexCache);

              docService.asyncFetchIndex(path, function(result) {
                  var model = $scope.partialModel = jsyaml.load(result);
                  if (model instanceof Array) {
                    // toc list
                    $scope.partialPath = 'template' + '/tocpage.tmpl';
                  } else {
                  $scope.title = model.id;
                    if (model.type.toLowerCase() === 'namespace') {
                      $scope.itemtypes = docService.setItemTypeVisiblity(NG_ITEMTYPES.namespace, model.items);
                      $scope.partialPath = 'template' + '/namespace.tmpl';
                    } else {
                      $scope.itemtypes = docService.setItemTypeVisiblity(NG_ITEMTYPES.class, model.items);
                      $scope.partialPath = 'template' + '/class.tmpl';
                    }
                  }
                },
                function() {
                  $scope.breadcrumb = [];
                  $scope.partialPath = 'template/error404.tmpl';
                }
              );
            } else {
              // If not md or yaml, simply try load the path
              $scope.partialPath = path;
            }
          }

          var pathParts = pathInfo.tocPath ? pathInfo.tocPath.split('/') : [];
          if (pathInfo.contentPath) pathParts.push('!' + pathInfo.contentPath);
          var breadcrumb = $scope.breadcrumb = [];
          var breadcrumbPath = '';
          angular.forEach(pathParts, function(part) {
            if (part) {
              breadcrumbPath += part;
              breadcrumb.push({
                name: part,
                url: breadcrumbPath
              });
              breadcrumbPath += '/';
            }
          });
        } else {
          if ($scope.navbar && $scope.navbar.length > 0) {
            $location.url($scope.navbar[0].href);
          }
        }
      });

      function mdIndexWatcher(path){
        if ($scope.mdIndex && $scope.partialModel) {
          var mdPath = $scope.mdIndex[$scope.partialModel.id];
          if (mdPath) {
            if (mdPath.href) {
              $scope.partialModel.mdHref = docService.getRemoteUrl(mdPath);
              var tocPath = docService.getPathInfo($location.path()).tocPath;
              var href = (tocPath || '') + '/' + mdPath.href;
              var getMdIndex = docService.asyncFetchIndex(href,
                function(result) {
                  var md = result.substr(mdPath.startLine, mdPath.endLine - mdPath.startLine + 1);
                  $scope.partialModel.mdContent = md;
                });
            }
          }
        }
      }

      $scope.$watch(function modelWatch() {
        return $scope.partialModel ;
      }, mdIndexWatcher);

      $scope.$watch(function modelWatch() {
        return $scope.mdIndex ;
      }, mdIndexWatcher);

      // listen for toc change
      // $scope.$watch(function modelWatch() {
      //   return $scope.toc;
      // }, function modelWatchAction(toc) {
      //   if (toc && toc.content) {
      //     var info = docService.getPathInfo($location.path());
      //     if (!info.contentPath) {
      //       docService.getDefaultItem(toc.content,
      //         function(defaultItem) {
      //           if (defaultItem && defaultItem.href) {
      //             $location.url(docService.getContentUrlWithTocAndContentUrl(toc.path, defaultItem.href));
      //           }
      //         });
      //     }
      //   }
      // });

      // listen for toc change
      $scope.$watch(function modelWatch() {
        return $scope.navbar;
      }, function modelWatchAction(navbar) {
        if (!$location.path() && navbar && navbar.count > 0) {
          $location.url(navbar[0].href);
        }
      });

      /**********************************
       Initialize
       ***********************************/

      $scope.versionNumber = angular.version.full;
      $scope.version = angular.version.full + "  " + angular.version.codeName;
      $scope.loading = 0;
    }
  ]);