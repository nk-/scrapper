'use strict';

function saveOptions(event) {
  
  event.preventDefault();

  window.scrollTo(0, 0);
  
  var elements = Object.fromEntries(new FormData(document.querySelector('form#drupal-scrapper-options')).entries());
  
  if (elements.emails) {
    elements.emails = elements.emails.replace(/^\s+|\s+$/gm,'');//.trim();
    //console.log(elements.emails.trim());
    document.querySelector('[name="emails"]').value = elements.emails;
  }

  chrome.storage.sync.set({drupalScrapper: elements}, function() {
    var data = {
      name: elements.name || null,
      pass: elements.pass ? elements.pass : null,
    };
    
    if (!window.scrapperController.userStatus) { // User is NOT logged in Drupal in this browser
      window.scrapperController.login(data);
    }
    else { // User IS logged in this browser, proceed with saving but check and warn about any empty login data fields 
      
      // First logout user
      // Note, seems it's the only way to validate password input on our forms, via login callback as otherwise no password is returned from Drupal by any user related JSON API call
      window.scrapperController.logout();


      setTimeout(function() {
        window.scrapperController.login(data);
      }, window.scrapperController.timeouts.appendDelay);

     window.scrapperController.asyncRequest('Saving', 'status');

      var errors = [];
      if (!elements.name) {
        errors.push({type: 'warning', status: 'Warning: ', title: window.scrapperController.messages.nameEmpty});
      }

      if (!elements.pass) {
        errors.push({type: 'warning', status: 'Warning: ', title: window.scrapperController.messages.passEmpty});
      }
      
      if (!window.scrapperController.userStatus) {
        errors.push({type: 'error', status: 'No writing access', title: ''});
      }

      setTimeout(function() {
        if (errors.length) {
          window.scrapperController.error(errors);
        }   
      }, window.scrapperController.timeouts.warningDelay);
    }

  });
}

// Extensions's Options page init
// Restores elements' state using the preferences stored in chrome.storage or fron local "config.json" as secondary data source.
function initOptions() {
  
  window.scrapperController = window.scrapperController || {};

  chrome.storage.sync.get('drupalScrapper', function(storage) {
      
    var callbacks = {
      context: 'options'
    };

    var config = storage && storage.drupalScrapper ? storage.drupalScrapper : null;
    if (!config) {
      callbacks.main = {
        call: 'getLocalConfig',
        message: 'Fetching configuration'
      };

      var xhttpOptions = {
        url: '/config.json'
      };
    }
    else {
      callbacks.main = {
        call: 'handshake',
        message: 'Handshaking with Host'
      };
      
      // This actually gets information about cookie, user login status in Drupal in this browser
      // As a part of JSON API "me" object should be available here with user's "id" and "href" properties
      callbacks.post = 'entryPoint';
      
      // Then, the following callback to be run parses information about user given by previous call
      var xhttpData = { callback: 'userData'}; 
  
      var xhttpOptions = {
        url: config.base_url + '/' + config.token_uri
      };
    }


    window.scrapperController = new DrupalScrapper(config, callbacks, xhttpOptions, xhttpData);

      
  });

}

document.addEventListener('DOMContentLoaded', initOptions);
document.getElementById('save').addEventListener('click', saveOptions);