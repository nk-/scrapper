'use strict';

// Extensions's Popup init
if (document.readyState !== 'complete') {
  window.addEventListener('load', initPopup);
}
else {
  initPopup();
}

// Everything that needs to happen after popup window is fully loaded.
function initPopup() {
  
  window.scrapperController = window.scrapperController || {};

  chrome.storage.sync.get('drupalScrapper', function(storage) {
  
    var callbacks = {
      context: 'popup'
    };

    var config = storage && storage.drupalScrapper ? storage.drupalScrapper : null;
    if (config) {
      
      var url = config.base_url + '/' + config.token_uri;
      
      //alert(url);
      callbacks.main = {
        call: 'handshake',
        message: 'Handshaking with Host'
      };
      // This actually gets information about cookie, user login status in Drupal in this browser
      // As a part of JSON API "me" object should be available here with user's "id" and "href" properties
      callbacks.post = 'entryPoint';
     
      // Then, the following callback to be run parses information about user given by previous call
      var postCallback = 'userData';


    }
    else {
      callbacks.main = {
        call: 'getLocalConfig',
        message: 'Fetching local configuration'
      };
      var url = '/config.json';
    }   

    var xhttpOptions = {
      url: url
    };

    // This becomes yet another chained callback, a 3rd and the last in order of callbacks
    var xhttpData = postCallback ? { callback: postCallback } : null;
 
    window.scrapperController = new DrupalScrapper(config, callbacks, xhttpOptions, xhttpData);
 
  });

  
  /*
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse){
    console.log(request);
  });

  chrome.runtime.getBackgroundPage(function(bgWindow) {
    console.log(bgWindow);
  });
  */
}