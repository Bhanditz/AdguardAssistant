/**
 * Manages iframe and it's content
 * @param $
 * @param settings
 * @param uiUtils
 * @param gmApi
 * @param log
 * @param selector
 * @param uiValidationUtils
 * @param localization
 * @returns {{showDetailedMenu: showDetailedMenu, showSelectorMenu: showSelectorMenu, showSliderMenu: showSliderMenu, showBlockPreview: showBlockPreview, showSettingsMenu: showSettingsMenu, setButtonPosition: setButtonPosition, onCloseMenu: CustomEvent, onShowMenuItem: CustomEvent, removeIframe: removeIframe, resizeSliderMenuToAdvanced: resizeSliderMenuToAdvanced, resizeSliderMenuToNormal: resizeSliderMenuToNormal}}
 * @constructor
 */
/* global CSS, HTML, StringUtils, Ioc, DetailedMenuController, SelectorMenuController, SliderMenuController, BlockPreviewController, SettingsMenuController */

var IframeController = function ($, settings, uiUtils, gmApi, log, selector, uiValidationUtils, localization, protectedApi) { // jshint ignore:line
    var iframe = null;
    var iframeAnchor = null;
    var currentItem = null;
    var iframeMaxWidth = 320;
    var iframeMaxHeight = 407;
    var menuMaxWidth = 668;
    var settingsMaxWidth = 458;
    var iframePositionOffset = 20;
    var sliderMenuHeight = {advanced: 420, normal: 291};
    var buttonPosition = null;
    var blockedElementsStyleID = 'ag-hide-elements-style-id';

    var views = {};

    views[settings.MenuItemsNames.DetailedMenu] = HTML.detailed_menu;
    views[settings.MenuItemsNames.SelectorMenu] = HTML.selector_menu;
    views[settings.MenuItemsNames.SliderMenu] = HTML.slider_menu;
    views[settings.MenuItemsNames.BlockPreview] = HTML.preview;
    views[settings.MenuItemsNames.SettingsMenu] = HTML.settings_menu;

    if(window.innerWidth < menuMaxWidth) menuMaxWidth = window.innerWidth;
    if(window.innerWidth < settingsMaxWidth) settingsMaxWidth = window.innerWidth;

    var onCloseMenu = new CustomEvent();
    var onShowMenuItem = new CustomEvent();

    var createIframe = function (onIframeLoadCallback) {
        log.debug('Creating iframe');
        iframe = protectedApi.createElement('iframe');

        // IE hack for prevent access denied error
        // see: https://stackoverflow.com/questions/1886547/access-is-denied-javascript-error-when-trying-to-access-the-document-object-of
        if (navigator.userAgent.match(/msie/i)) {
            iframe.src= "javascript:'<script>window.onload=function(){document.write(\\'<script>document.domain=\\\"" + document.domain + "\\\";<\\\\/script>\\');document.close();};<\/script>'";
        }

        var attributes = {
            id: settings.Constants.IFRAME_ID,
            'class': selector.ignoreClassName(),
            frameBorder: 0,
            allowTransparency: 'true'
        };
        Object.keys(attributes).forEach(function (item) {
            iframe.setAttribute(item, attributes[item]);
        });
        var iframeAlreadyLoaded = false;
        $(iframe).on('load', function () {
            if (iframeAlreadyLoaded) {
                //IE calls load each time when we use document.close
                return;
            }

            iframeAlreadyLoaded = true;
            onIframeLoadCallback();
        });

        if (protectedApi.checkShadowDomSupport()) {
            iframeAnchor = protectedApi.createElement('div');
            createShadowRootElement(iframeAnchor).appendChild(iframe);
        } else {
            iframeAnchor = iframe;
        }

        document.documentElement.appendChild(iframeAnchor);
    };

    var createShadowRootElement = function(iframeAnchor) {
        var shadowiframeAnchor = iframeAnchor.attachShadow({mode: 'closed'});
        var stylesElement = protectedApi.createStylesElement(CSS.common + CSS.iframe, getStyleNonce());
        shadowiframeAnchor.appendChild(stylesElement);

        return shadowiframeAnchor;
    };

    var getIframePosition = function() {
        var viewPort = uiValidationUtils.getViewPort();

        if (!buttonPosition) {
            return {
                left: iframe.offsetLeft <= 0 ? window.innerWidth : iframe.offsetLeft,
                top: parseInt(iframe.style.top) || iframePositionOffset
            };
        }

        var defaultPosition = {
            left: buttonPosition.left,
            top: buttonPosition.top
        };
        var sides = [
            { //left top
                left: buttonPosition.left - iframeMaxWidth - iframePositionOffset,
                top: buttonPosition.top - iframeMaxHeight - iframePositionOffset
            },
            { //right top
                left: buttonPosition.left + iframePositionOffset,
                checkLeft: buttonPosition.left + iframeMaxWidth + iframePositionOffset,
                top: buttonPosition.top - iframeMaxHeight - iframePositionOffset
            },
            { //bottom right
                left: buttonPosition.left + iframePositionOffset,
                checkLeft: buttonPosition.left + iframeMaxWidth + iframePositionOffset,
                checkTop: buttonPosition.top + iframeMaxHeight + iframePositionOffset,
                top: buttonPosition.top + iframePositionOffset
            },
            { //bottom left
                left: buttonPosition.left - iframeMaxWidth - iframePositionOffset,
                checkTop: buttonPosition.top + iframeMaxHeight + iframePositionOffset,
                top: buttonPosition.top + iframePositionOffset
            }
        ];

        for (var i = 0; i < sides.length; i++) {
            var currentSide = sides[i];
            var left = currentSide.checkLeft ? currentSide.checkLeft : currentSide.left;
            var top = currentSide.checkTop ? currentSide.checkTop : currentSide.top;

            if (left < 0 || left > viewPort.width) {
                continue;
            }
            if (top < 0 || top > viewPort.height) {
                continue;
            }
            return currentSide;
        }

        return defaultPosition;
    };

    var specifyIframePosition = function () {
        var viewPort = uiValidationUtils.getViewPort();

        if ((iframe.offsetLeft + iframe.offsetWidth) > viewPort.width) {
            iframe.style.left = Math.max(0, (viewPort.width - iframe.offsetWidth - iframePositionOffset)) + 'px';
        }
        if (iframe.offsetLeft < 0) {
            iframe.style.left = iframePositionOffset + 'px';
        }
        if ((iframe.offsetTop + iframe.offsetHeight) > viewPort.height) {
            iframe.style.top = Math.max(0, (viewPort.height - iframe.offsetHeight - iframePositionOffset)) + 'px';
        }
        if (iframe.offsetHeight < 0) {
            iframe.style.top = iframePositionOffset + 'px';
        }
    };

    // Important attribute for all inline stylesheets.
    // It needs for Content-Security-Policy.
    var getStyleNonce = function () {
        var adgSettings = settings.getAdguardSettings();
        if (adgSettings === null) {
            return '';
        }
        return adgSettings.nonce;
    };

    var showMenuItem = function (viewName, controller, width, height, options) {
        log.debug(StringUtils.format("Showing menu item: {0}", viewName));
        if (currentItem === viewName) {
            return;
        }
        var onIframeLoad = function () {
            var frameElement = iframe;

            var view = protectedApi.createElement(views[viewName]);
            var stylesElement = protectedApi.createStylesElement(CSS.common + CSS.button + CSS.iframe, getStyleNonce());
            view.appendChild(stylesElement);
            appendContent(view);
            localize();
            if (!options) {
                options = {};
            }
            options.iframeAnchor = iframeAnchor;
            controller.init(frameElement, options);
            currentItem = viewName;
            onShowMenuItem.notify();
            if (options.dragElement) {
                uiUtils.makeIframeDraggable(iframe, iframe.contentDocument.querySelector(options.dragElement));
            }

            // make iframe size as like internal content size
            resizeIframe(width, height);

            var iframePosition = getIframePosition();
            iframe.style.left = iframePosition.left + 'px';
            iframe.style.top = iframePosition.top + 'px';

            // fixing iframe position after resize, to avoid iframe outside of the viewport
            specifyIframePosition();
        };

        if (!iframe) {
            var adgStylesSelector = protectedApi.createStylesElement(CSS.selector, getStyleNonce(), 'adg-styles-selector');
            if (adgStylesSelector) {
                document.documentElement.appendChild(adgStylesSelector);
            }

            createIframe(onIframeLoad);
            return;
        }
        onIframeLoad();
    };

    var setButtonPosition = function (coords) {
        buttonPosition = coords;
    };

    var showDetailedMenu = function () {
        var controller = Ioc.get(DetailedMenuController);
        var options = {dragElement: '.menu-head'};
        showMenuItem(settings.MenuItemsNames.DetailedMenu, controller, iframeMaxWidth, 'auto', options);
        setCloseEventIfNotHitIframe(true);
    };

    var showSelectorMenu = function () {
        var controller = Ioc.get(SelectorMenuController);
        var options = {dragElement: '.head'};
        showMenuItem(settings.MenuItemsNames.SelectorMenu, controller, menuMaxWidth, 160, options);
        setCloseEventIfNotHitIframe(false);
    };

    var showSliderMenu = function (initElement, currentElement, path, optionsState) {
        var controller = Ioc.get(SliderMenuController);
        var options = {element: initElement, path: path, dragElement: '.head', currentElement: currentElement, options: optionsState};
        showMenuItem(settings.MenuItemsNames.SliderMenu, controller, menuMaxWidth, 'auto', options);
        setCloseEventIfNotHitIframe(true);
    };

    var showBlockPreview = function (initElement, path, currentElement, optionsState) {
        var controller = Ioc.get(BlockPreviewController);
        var options = {element: initElement, path: path, dragElement: '.head', currentElement: currentElement, options: optionsState};
        showMenuItem(settings.MenuItemsNames.BlockPreview, controller, menuMaxWidth, 'auto', options);
        setCloseEventIfNotHitIframe(true);
    };

    var showSettingsMenu = function () {
        var controller = Ioc.get(SettingsMenuController);
        var options = {dragElement: '.head'};
        showMenuItem(settings.MenuItemsNames.SettingsMenu, controller, 400, 468, options);
        setCloseEventIfNotHitIframe(true);
    };

    var localize = function () {
        var elements = iframe.contentDocument.querySelectorAll("[i18n]");
        for (var i = 0; i < elements.length; i++) {
            var message = localization.getMessage(elements[i].getAttribute("i18n"));
            localization.translateElement(elements[i], message);
        }
    };

    var resizeIframe = function(width, height) {
        var frame = iframe;

        // setting iframe height dynamically based on inner content
        if (height === 'auto' || !height) {
            height = frame.contentWindow.document.body.querySelector('.main').clientHeight || iframeMaxHeight;
        }

        if (width) {
            frame.width = width;
            frame.style.setProperty('width', width + 'px', 'important');
        }

        if (height) {
            frame.height = height;
            frame.style.setProperty('height', height + 'px', 'important');
        }
    };

    var resizeSliderMenuToAdvanced = function () {
        resizeIframe(null, null);
    };

    var resizeSliderMenuToNormal = function () {
        resizeIframe(null, null);
    };

    var appendContent = function (view) {
        var body = iframe.contentDocument.body;
        for (var i = 0; i < body.children.length; i++) {
            body.removeChild(body.children[i]);
        }
        body.appendChild(view);
    };

    var setCloseEventIfNotHitIframe = function (setEvent) {
        document.removeEventListener('click', removeIframe);

        if(setEvent) {
            window.setTimeout(function () {
                document.addEventListener('click', removeIframe);
            }, 150);
        }
    };

    // e.isTrusted checking for prevent programmatically events
    // see: https://github.com/AdguardTeam/AdguardAssistant/issues/134
    var removeIframe = function(e) {
        if (e && e.isTrusted === false) {
            return false;
        }

        if (!iframeAnchor) {
            return false;
        }

        document.removeEventListener('click', removeIframe);
        document.documentElement.removeChild(iframeAnchor);
        iframe = null;
        iframeAnchor = null;
        currentItem = null;
        selector.close();
        onCloseMenu.notify();
    };

    var hideElementsByPath = function (selectedPath, styleID) {
        if (!selectedPath) {
            return false;
        }

        var selector, style;

        if (selectedPath.indexOf('://') > 0) {
            // all images by src
            selector = '[src*="' + selectedPath.split('$domain=')[0] + '"]';
        } else {
            selector = selectedPath.split('##')[1];
        }

        if (selector) {
            style = selector + '{display:none!important}';
        } else {
            log.error('Can`t block element: `selector` path is empty');
            return false;
        }

        if (!styleID) {
            styleID = blockedElementsStyleID;
        }

        var stylesElement = document.documentElement.querySelector('#' + styleID);

        if (stylesElement) {
            stylesElement.innerHTML = stylesElement.innerHTML + ' ' + style;
        } else {
            document.documentElement.appendChild(protectedApi.createStylesElement(style, getStyleNonce(), styleID));
        }

        // do not hide assistant div if the user wrote a rule
        // that blocks all div or iframe elements
        iframeAnchor.style.setProperty('display', 'block', 'important');
    };

    // show elements hidden by `hideElementsByPath` function
    var showHiddenElements = function (styleID) {
        if (!styleID) {
            styleID = blockedElementsStyleID;
        }
        var stylesElement = document.documentElement.querySelector('#' + styleID);

        if (stylesElement) {
            stylesElement.parentNode.removeChild(stylesElement);
        }
    };

    var blockElement = function (path, addRule) {
        if (gmApi.ADG_addRule) {
            gmApi.ADG_addRule(path, function () {
                removeIframe();
                hideElementsByPath(path);
                CommonUtils.bypassCache();
            });
        } else {
            if (!addRule) {
                log.error('Callback function `addRule` can\'t be undefined!');
            }

            addRule(path);
            removeIframe();
            hideElementsByPath(path);
            CommonUtils.bypassCache();
        }
    };

    return {
        showDetailedMenu: showDetailedMenu,
        showSelectorMenu: showSelectorMenu,
        showSliderMenu: showSliderMenu,
        showBlockPreview: showBlockPreview,
        showSettingsMenu: showSettingsMenu,
        setButtonPosition: setButtonPosition,
        onCloseMenu: onCloseMenu,
        onShowMenuItem: onShowMenuItem,
        removeIframe: removeIframe,
        resizeSliderMenuToAdvanced: resizeSliderMenuToAdvanced,
        resizeSliderMenuToNormal: resizeSliderMenuToNormal,
        resizeIframe: resizeIframe,
        hideElementsByPath: hideElementsByPath,
        showHiddenElements: showHiddenElements,
        blockElement: blockElement
    };
};
