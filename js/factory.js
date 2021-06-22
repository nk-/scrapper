'use strict';

/**
 * Class for popup's form, performs required actions
 * such as pinging base Drupal website via GET for handshake (token)
 * then authorization call/check and finally pre-filling data from current web page's data
 *
 * Submitting the form makes POST request against Drupal database
 * Both requests implement Drupal's core JSON API
 *
 * @constructor
 */
var DrupalScrapper = function(storage, callbacks, xhttpOptions = null, xhttpData = null) {
  
  var self = this;
  
  // Handle buttons
  self.buttons = document.getElementById('buttons') ? document.getElementById('buttons').children : []; 
  if (self.buttons.length) {
    self.addButtonsListeners();
  }

  self.messages.wrapper = document.getElementById('messages') || null;
  self.loginDetails = document.getElementById('login-wrapper') || null;
  self.issuesSelect = document.getElementById('issues') || null;
  
  // Set chrome.storage locally
  self.config = storage;

  // Handle async requests
  if (xhttpOptions) {
    self.xhttpOptions = Object.assign(self.xhttpOptions, xhttpOptions);
  }
  
  // Set data for POST request (or in certain case additional xhttp request in chain)
  self.xhttpData = xhttpData;
  
  // Handle form default values, picking from extension configuration or from local "config.json" at a second level
  if (storage) {
    self.setDefaultValues();
  }

  // A simple class toggle for <select multiple> elements
  var dropdowns = document.querySelectorAll('select');
  dropdowns.forEach(function(dropdown) {
    dropdown.addEventListener('change', function(event) {
      event.currentTarget.classList.add('selected');
    }); 
  });

  // Run main callbacks
  if (callbacks) {

    // Assign initial callbacks data here
    self.xhttpCallbacks = callbacks;
 
    // Run init xhttp requests
    if (callbacks.main && callbacks.main.call && typeof self[callbacks.main.call] === 'function') {
      var message = callbacks.main.message ? callbacks.main.message : 'Connecting';
      self.asyncRequest(message, callbacks.main.call, callbacks.post);
    }
    
    // A context specific operations, i.e. some functionality to happen in popup.html and another one in options.html
    // Both popup.js and options.js call and initialize this class
    if (callbacks.context && typeof self[callbacks.context] === 'function') {
      setTimeout(function() {
        self[callbacks.context](storage);
      }, self.timeouts.context);
    }
  }
 
}

DrupalScrapper.prototype = {
  
  /**
   * A copy of chrome.storage data, this plugin's options configuration or local "config.json" as fallback/default values 
   *
   * @type {Object}
   */
   config: {},

   /**
    * A cached reference to form buttons
    *
    * @type [Array]
    */
   buttons: [],
  
   /**
    * Definition of status, warning and error messages
    *
    * @type {Object}
    */
   messages: {
     wrapper: null,
     errors: ['status', 'warning', 'error'],
     response: {
       complete: 'Complete!'
     },
     urls: {
       options: chrome.runtime.getURL('html/options.html'),
       drupalLogin: null, 
     },
     
     authenticated: '<em>Username</em> or <em>Password</em> empty. Currently you are logged in base Drupal website in this browser and you may have a permission to read and write. However, it is recommended to fill in and store your <em>Login data</em> in the form below.',
     
     authorizationCheck: 'Checking current authorization status',

     authorizationCheckSave: 'Checking current authorization status and saving',

     unauthorized: '<em>Currently you have no permission to post content. You need to be either:</em><ol><li>Store your credentials on this <a href="' + chrome.runtime.getURL('html/options.html') + '" target="blank_">extension\'s options</a></li><li>Provide username/password in the <em>Login data</em> below</li><li>Log in <a target="blank_" href="@drupalLogin"> base Drupal website</a> in this browser </li></ol>',
     
     unauthorizedOptions: 'Fill in and store your Drupal credentials (username/password) in <em>Login data</em> below to gain permission to read and write content to Drupal host. Optionally, you can enter it in the popup\'s form directly.',
     
     nameEmpty: '<em>Username</em> empty. Entering and storing your Drupal user credentials here is recommended.',
     passEmpty: '<em>Password</em> empty. Entering and storing your Drupal user credentials here is recommended.',

     textareaLength: 'characters left (Max 255 characters is Drupal\'s limitation for Title field length). The original text may be trimmed.',
     textareaLengthInvalid: 'Input is over the limit of characters (Max 255 characters is Drupal\'s limitation for Title field length) and you need to make it shorter.'

   },

   /**
    * Timeouts, mostly for messages or similar
    *
    * @type {Object}
    */
   timeouts: {
     context: 700,
     popup: 1450,
     appendDelay: 1150,
     removeDelay: 2250,
     warningDelay: 3150
   },

   /**
    * Login details parent fieldset/wrapper
    *
    * @type {Element}
    */
   loginDetails: null,

   /**
    * Issues select form element
    *
    * @type {Element}
    */
   issuesSelect: null,

   /**
    * Add event listeners to buttons in order to capture a user's click and perform POST actions
    */
   addButtonsListeners: function() {
     var self = this;
     for (var i = 0; i < self.buttons.length; i++) {
       self.buttons[i].addEventListener('click', self.handleClick); //button.addEventListener('click', self.handleClick_.bind(self))
     };
   },

   /**
    * Define Node object data according to Drupal JSON API
    *
    * @param {Object} data Some data given from configuration or popup's form
    * @return {Object} A node object ready as POST data payload, for Drupal JSON API
    */
    defineNode: function(data) {
     var node = {
       "data" : {
         "type": "node--" + data.content_type,
         "attributes": {
           "title": data.title,
           "body": {
             "value": data.url,
             "format": "basic_html"
           },
           "status": data.content_status ? 1 : 0
         },
         "relationships": {
           "field_update2issues": { 
             "data": []
           }
         }
       }  
     };
     
     if (data.issues) {
       data.issues.forEach(function(issue) {
         node.data.relationships.field_update2issues.data.push({"type": "node--issues", "id": issue });
        });
     }
     return node;
   },

   defineEmail: function(data) {
     var mail = {
       "data" : {
         "type": "share--share",
         "attributes": {
           "title": data.title
           //"pass": data.pass
         } 
       }
     };
     return mail;
   },


   /**
    * Define User object data according to Drupal JSON API
    *
    * @param {Object} data Some data given from configuration or popup's form
    * @return {Object} A user object ready as POST data payload, for Drupal JSON API
    */
   defineUser: function(data) {
    var user = {
      "data" : {
        "type": "user--user",
        "attributes": {
          "name": data.name,
          "pass": data.pass
        } 
      }
    };
     return user;
   },

   /**
    * Object with information about init callbacks and context
    * 
    * @type {Object}
    */
   xhttpCallbacks: {},

   /**
    * Object with keys/values to provide to XMLHttpRequest
    * It can be exgended or overriden on class init
    * 
    * @type {Object}
    */
   xhttpOptions: {
    method: 'GET',
    headers: {
      all: [{ key: 'X-Requested-With', value: 'XMLHttpRequest' }],
      get: [{ key: 'Content-Type', value: 'application/x-www-form-urlencoded; charset=utf-8' }],
      post: [{ key: 'Accept', value: 'application/vnd.api+json'}, { key: 'Content-Type', value: 'application/vnd.api+json'}] 
    },
    data: {}
  },

  /**
   * Data for xhttp POST request
   * It can be exgended or overriden on class init
   * 
   * @type {Object}
   */
  xhttpData: null,

  /**
   * Token requested from Drupal's '/session/token' route
   * 
   * @type {String}
   */
  token: null,
  
  /**
   * Flag with user status 0/1
   * If user is logged in Drupal in the same browser it will be ID or CSRF token string, else 0
   * 
   * @type integer|string
   */
  userStatus: null,
  
  /**
   * Construct XMLHttpRequest class
   */ 
  xhttp: new XMLHttpRequest(),
  
  /**
   * Main method, serves as generic XMLHttpRequest callback
   * 
   * @param {String} message A text to show in messages section while executing request 
   * @param {String} callback Name of this class' method to execute as callback after response was returned from API
   * @param {String} postCallback  Name of additional method to chain in execution, executes after first callback 
   *
   * @return {Class} XMLHttpRequest()
   */
  asyncRequest: function(message, callback, postCallback, persistErrors = null) {

    var self = this;
    if (self.messages.wrapper) {
      
      // First remove any previous classes (error, warning, status)
      self.messages.errors.forEach(function(error) {
        if (!persistErrors) {
          self.messages.wrapper.classList.remove(error);
        }
      });

      self.messages.wrapper.classList.remove('hidden');
      self.messages.wrapper.classList.add('message');

      if (persistErrors) {
        //self.messages.wrapper.innerHTML += message;
        var appendMessage = self.messages.wrapper.cloneNode(true);
        appendMessage.innerHTML = message;
        appendMessage.classList.remove('warning');
        appendMessage.classList.remove('error');
        self.messages.wrapper.parentNode.insertBefore(appendMessage, self.messages.wrapper); 
        
      } 
      else {
        self.messages.wrapper.innerHTML = message;
      }
    }

    // If URL is not provided by xhttpOptions construct a default one, a default entry point
    if (!self.xhttpOptions.url) {
      self.xhttpOptions.url = self.config.base_url + '/' + self.config.entry_point;
    }
 
    // Open request
    self.xhttp.open(self.xhttpOptions.method, self.xhttpOptions.url, self.xhttpOptions.async || true);

    // Set default ajax headers
    self.xhttpOptions.headers.all.forEach(function(header) {
      self.xhttp.setRequestHeader(header.key, header.value);
    });

    // Set request listener
    self.xhttp.onreadystatechange = function() {

      // When answer received
      if (this.readyState === XMLHttpRequest.DONE) {
      
        // Try parse JSON response
        var response = self.isJson(this.responseText) ? JSON.parse(this.responseText) : this.responseText;
        
        // Switch http status code on response
        switch (this.status) {
         
          case 200:
          case 201:  
            if (callback) {
              if (postCallback) {
                return self[callback](response, postCallback);
              }
              else {
                return self[callback](response);
              }
            }
            else {
              return true;
            }       
          break;
          
          /**
           * Errors handling
           */
          // Bad request
          case 400:
          // Forbidden
          case 403:
          // Not found
          case 404:
          // Method now allowed
          case 405:
          // Not acceptable
          case 406:
          // Unprocessable entity
          case 422:
          // Internal server error (on specified backend of course)
          case 500:
            if (self.messages.wrapper) {
              if ((response.errors && response.errors.length) || response.message) {
                var errors = response.errors && response.errors.length ? response.errors : [{ type: 'error', status: 'Error: ', title: '<em>' + response.message + '</em>' }];
                self.error(errors);
              } 
            }
          break;
          default:
            // Do nothing
          break;
        }
      }
    };

    // Send request
    if (['POST','PUT','PATCH'].indexOf(self.xhttpOptions.method) !== -1) {
      
      // Set type and authorization headers
      self.xhttpOptions.headers.post.forEach(function(header) {
        self.xhttp.setRequestHeader(header.key, header.value);
      });

      // Format data into json and send request
      var data = self.xhttpOptions.data ? self.xhttpOptions.data : {};
      return self.xhttp.send(JSON.stringify(data));
    }
    else {
      // Set url encoded headers
      self.xhttpOptions.headers.get.forEach(function(header) {
        self.xhttp.setRequestHeader(header.key, header.value); 
      });
      // Send no data
      return self.xhttp.send();
    }
  },
  
  /**
   * A default init callback in chain of callbacks after a response was given by XMLHttpRequest
   *
   * @param {String|Object} response A response from XMLHttpRequest. Typically it would be a token string
   * @param {String} callback A callback to run next 
   */
  handshake: function(response, callback) {
    if (response) {
      if (typeof response === 'string') {
        this.token = response;
      }
    
      if (callback) {
        this[callback](response); 
      }
      else {
        this.status(response); 
      }  
    }
  },

  /**
   * A default final callback in chain of callbacks after a response was given by XMLHttpRequest
   * 
   * @param {String|Object} response A response from XMLHttpRequest
   * @param {Boolean} persistErrors Controls persistence of some warnings and errors
   *
   * @return {String|Object} A response from XMLHttpRequest
   */
  status: function(response, persistErrors = false) {
    var self = this;

    console.log(response);

    if (persistErrors) {
  
      var messageWrappers = document.querySelector('#info');
      if (messageWrappers && messageWrappers.children.length) {
        setTimeout(function() {
          messageWrappers.children[0].innerHTML = self.messages.response.complete;
        }, self.timeouts.appendDelay); 
      }
      setTimeout(function() {
        messageWrappers.children[0].innerHTML = '';
        messageWrappers.children[0].classList.remove('message');
        messageWrappers.children[0].classList.add('hidden'); 
      }, self.timeouts.removeDelay);
  
    }
    else {
    
      // First remove any previous classes (error, warning, status)
      if (self.messages.wrapper) {
        self.messages.errors.forEach(function(error) {
          self.messages.wrapper.classList.remove(error);
        });
      }

      if (self.loginDetails) {
        self.loginDetails.removeAttribute('open');
      }

      if (self.messages.wrapper) {
       
        setTimeout(function() {
          self.messages.wrapper.innerHTML = self.messages.response.complete;
        }, self.timeouts.appendDelay);
        
        setTimeout(function() {
          self.messages.wrapper.innerHTML = '';
          self.messages.wrapper.classList.remove('message');
          self.messages.wrapper.classList.add('hidden'); 
        }, self.timeouts.removeDelay);
      }
    }

    if (response) {
      if (response.current_user && response.current_user.csrf_token) {
       // self.userStatus = response.current_user.csrf_token;   
      }
      return response;
    }
  },

  /**
   * A default errors handler
   * 
   * @param [Array] errors An array of objects with "status", "title", "detail" error properties
   * Each error is shown as <li> element in messages container
   *
   * @return {String|Object} A response from XMLHttpRequest
   */
   error: function(errors) {
    
    var self = this;
    
    if (self.messages.wrapper) {
      
      // First remove any previous classes (error, warning, status)
      self.messages.errors.forEach(function(error) {
        self.messages.wrapper.classList.remove(error);
      });
      
      self.messages.wrapper.classList.remove('hidden');
      self.messages.wrapper.classList.add('message');
      var type = errors[0].type ? errors[0].type : 'error';

      self.messages.wrapper.classList.add(type);
      self.messages.wrapper.innerHTML = '<ul class="errors no-list">'; 
    
      errors.forEach(function(error) {
        console.log(error);
        self.messages.wrapper.innerHTML += error.detail ? '<li class="no-list">' + error.status + ' ' + error.title + '<br />See more details in browser console.' + '</li>' : '<li class="no-list">' + error.status + ' ' + error.title + '</li>';
        if (error.detail) {
          console.log('[' + error.status + '] ' + error.title + ': ' + error.detail);
        }
      
      });
      self.messages.wrapper.innerHTML += '</ul>';
    }
    return false;
  },
  
  loginStatus: function(token, callback) {
  
     if (typeof token === 'string') {
       var xhttpOptions = {
        url: this.config.base_url + '/user/login_status?_format=json', //this.config.entry_point,
      };
      this.xhttpOptions = Object.assign(this.xhttpOptions, xhttpOptions);

      if (callback) {
        this.asyncRequest(this.messages.authorizationCheck, callback); 
      }
      else if (!callback && this.xhttpData && this.xhttpData.callback) {
        this.asyncRequest(this.messages.authorizationCheck, this.xhttpData.callback);
      }
      else {
        this.status(token); 
      }   
    }

  },

  getToken: function(response) {
    var xhttpOptions = {
      url: this.config.base_url + '/' + this.config.token_uri
    };
    this.xhttpOptions = Object.assign(this.xhttpOptions, xhttpOptions);
    this.asyncRequest(self.messages.authorizationCheckSave, 'entryPoint', 'status');

  },

  /**
   * Method for logging in user in Drupal.
   * Note this is not a part of JSON API @see https://www.drupal.org/docs/8/modules/jsonapi/what-jsonapi-doesnt-do
   * 
   * @param {Object} data An object with some user related data given from configuration or current form
   */
  login: function(data, callback) {
    var self = this;
    if (data.name && data.pass) {
      var xhttpOptions = {
        method: 'POST',
        url: self.config.base_url +  '/user/login?_format=json',
        data: data
      };
      self.xhttpOptions = Object.assign(this.xhttpOptions, xhttpOptions);
      var next = callback ? callback : 'status';
      self.xhttpData = data;
      self.xhttpData.callback = 'userData';
      
      self.asyncRequest(self.messages.authorizationCheckSave, 'getToken');
    }
    else {
      var error = self.messages.unauthorizedOptions.replace('@drupalLogin', self.config.base_url + '/user/login');
      var errors = [{ type: 'warning', status: 'Warning: ', title: 'You are not authorized to post content. ' + error }]; //type: 'warning', 
      
      self.asyncRequest('Saving data', 'status');

      setTimeout(function() {
        self.error(errors);
      }, self.timeouts.warningDelay);
    }
  },
  
  /**
   * Method for logging out (and eventually again in) user in Drupal.
   * Note this is not a part of JSON API @see https://www.drupal.org/docs/8/modules/jsonapi/what-jsonapi-doesnt-do
   * 
   * @param {Boolean} login A flag for doing re-login after logout 
   */
  logout: function(data, login = false) {
    var self = this;
    var xhttpOptions = {
      //method: 'POST',
      url: self.config.base_url +  '/user/logout?_format=json&csrf_token=' + self.userStatus,
    };
    /*var hasToken = false;
    self.xhttpOptions.headers.post.forEach(function(header) {
      if (header.key === 'X-CSRF-Token') {
        hasToken = true;
      }
    });

    if (!hasToken) {
      self.xhttpOptions.headers.post.push({key: 'X-CSRF-Token', value: self.token});
    }
    */
    self.xhttpOptions = Object.assign(this.xhttpOptions, xhttpOptions);
    
    // Note, seems it's the only way to validate password input on our forms, via login callback as otherwise no password is returned from Drupal by any user related JSON API call
    if (login) {
      self.asyncRequest(self.messages.authorizationCheckSave);
      self.login(data);
    }
    else {
      self.asyncRequest(self.messages.authorizationCheckSave, 'status');
    }
  },


  entryPoint: function(token, callback) {
  
    if (typeof token === 'string') {
      var xhttpOptions = {
        method: 'GET',
        url: this.config.base_url + '/' + this.config.entry_point,
        //data: { title: 'Blah'}
      };
      this.xhttpOptions = Object.assign(this.xhttpOptions, xhttpOptions);

      if (callback) {
        this.asyncRequest(this.messages.authorizationCheck, callback); 
      }
      else if (!callback && this.xhttpData && this.xhttpData.callback) {
        this.asyncRequest(this.messages.authorizationCheck, this.xhttpData.callback);
      }
      else {
        this.status(token); 
      }   
    }
      
  },
  
  share: function(response) {
    console.log(response);
    var self = this;
    var formData = Object.fromEntries(new FormData(document.querySelector('form#drupal-scrapper')).entries());
    self.xhttpData = Object.assign(self.config, formData);
    //self.xhttpData = formData; //self.defineEmail({title: 'Yeah'});

    var xhttpOptions = {
      method: 'POST',
      url: self.config.base_url + '/' + self.config.entry_point + '/share', //?include[title]=Blh',
      data: self.xhttpData
    }; 
    self.xhttpOptions = Object.assign(this.xhttpOptions, xhttpOptions);
    console.log(xhttpOptions);
    self.asyncRequest('Sending emails', 'status');
  },


  autoResize: function(element) {
    for (var i = 0; i < element.length; i++) {
      element[i].setAttribute('style', 'height:' + (element[i].scrollHeight) + 'px;overflow-y:hidden;');
      element[i].addEventListener("input", function() {
       this.style.height = 'auto';
       this.style.height = (this.scrollHeight) + 'px';
      }, false);
    }
  },
  
  setPostFieldsData: function(data, elements) {
    var formData = new FormData(document.querySelector('form#drupal-scrapper'));
    elements.forEach(function(element) {
      if (data[element]) {
        formData.set(element, data[element]);
        var input = document.getElementsByName(element);
        if (input[0]) {
          input[0].value = data[element];
        }
      }
    });
  },

  setLoginData: function(response, selector) { 
    console.log(response); 
    var formData = new FormData(document.querySelector('.drupal-scrapper'));
    if (response.data && response.data.attributes) {
      var name = response.data.attributes.name || response.data.attributes.display_name;
      //var uuid = response.data.id;

      if (name) { 
        formData.set('name', name);
        var username = document.querySelector('[name="name"]');
        if (username) {
          username.value = name;
        }
      }

      if (response.data.id) {
        formData.set('uuid', response.data.id);
        var uuid = document.querySelector('[name="uuid"]');
        if (uuid) {
          uuid.value = response.data.id;
        }
      }


      if (name && response.data.id) {
        
      }

    }

    this.status(response);
  },
  
  
  userData: function(response, callback) {
    var self = this;
    if (response.meta && response.meta.links && response.meta.links.me) { // Drupal JSON API specific response object

      self.userStatus = response.meta.links.me.meta && response.meta.links.me.meta.id ? response.meta.links.me.meta.id : 0;
      
      if (!self.config.name || !self.config.pass) {
         
         var xhttpOptions = {
          // method: 'POST',
           url: self.config.base_url + '/' + self.config.entry_point + '/user/user/' + self.userStatus
           //data: data
         };
         self.xhttpOptions = Object.assign(self.xhttpOptions, xhttpOptions);
         //var message = self.xhttpCallbacks.context === 'options' ? self.messages.authorizationCheckSave : 'Assigning login data';
         self.asyncRequest('Assigning login data', 'setLoginData');
           
         // Make request and complete
         //self.asyncRequest(self.messages.authorizationCheck, 'status'); //'setLoginData');
            
         // In case of any authorization related warnings show them with a delay
/*
         if (self.xhttpCallbacks.context === 'options') {
           var error = self.messages.unauthorizedOptions.replace('@drupalLogin', self.config.base_url + '/user/login');
           var errors = [{ status: 'Notice: ', title: self.messages.authenticated, type: 'warning' }];
           setTimeout(function() {
             self.error(errors);
           }, self.timeouts.warningDelay);
         }
*/
      }
      else {
        if (callback) {
          self[callback](response);
        }
        else {
          self.status(response);
        }
      }

    }
    else {

      // User is not logged in Drupal in this browser
      self.userStatus = 0;

      // User is not authorized to post content, both methods (cookie and basic_auth) failed. Inform user about it. 
      if (!self.config.name || !self.config.pass) {
        
        var unauthorized = self.xhttpCallbacks.context === 'options' ?  'unauthorizedOptions' : 'unauthorized';
        var error = self.messages[unauthorized] ? self.messages[unauthorized].replace('@drupalLogin', self.config.base_url + '/user/login') : 'Unknown error happened.'; 
        
        var errors = [{ status: 'Notice: ', title: error, type: 'warning' }];
        if (self.loginDetails) { 
          self.loginDetails.setAttribute('open', true); 
        }
        self.error(errors);      
        return false;
      }
      else {
        if (callback) {
          self[callback](response);
        }
        else {
          self.status(response);
        }
      }

    }     
    
  },

  issues: function(response) {
    var self = this;
    if (self.issuesSelect && response.data && response.data.length) {
      response.data.forEach(function(item) {
        var option = document.createElement('option');
        option.value = item.id; //item.attributes && item.attributes.drupal_internal__nid ? item.attributes.drupal_internal__nid : '';
        option.textContent =  item.attributes && item.attributes.title ? item.attributes.title : 'Empty';
        self.issuesSelect.appendChild(option);
      });
    }
  
    var persistErrors = null; 
    var messageWrappers = document.querySelector('#info');
    if (messageWrappers && messageWrappers.children.length) {
      persistErrors = true; //self.messages.wrapper && self.messages.wrapper.innerHTML.length ? true : null;
    }
    self.status(response, persistErrors);
  },

 
  goToOptions: function() {
    //document.querySelector('#go-to-options').addEventListener(function() {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
    else {
      window.open(chrome.runtime.getURL('html/options.html'));
    }
   //});
 },
     
  getLocalConfig: function(response) {
    this.config = response;
    this.setDefaultValues();

    var xhttpOptions = {
      url: this.config.base_url + '/' + this.config.token_uri
    };
    this.xhttpOptions = Object.assign(this.xhttpOptions, xhttpOptions);

    // This becomes yet another chained callback, a 3rd and the last in order of callbacks
    this.xhttpData = {callback: 'userData'};

    // Continue now with default chain of requests
    this.asyncRequest('Handshaking with Host', 'handshake', 'entryPoint') ;//'entryPoint');
  },

  setDefaultValues: function() {
    var self = this;
    if (self.config) {
      var names = Object.keys(self.config);
      if (names.length) {
        names.forEach(function(name) {
          var element = document.querySelector('[name="' + name + '"]');
          if (element && self.config[name]) {
            element.value = self.config[name];
          }
        });
      }
    }
  },

  isJson: function(input) {
    input = typeof input !== 'string' ? JSON.stringify(input) : input;
    try {
      input = JSON.parse(input);
    }
    catch (e) {
      //console.log(e);
      return false;
    }

    if (typeof input === 'object' && input !== null) {
      return true;
    }

    return false;
  },

  /**
   * Popup window specific UI definitions and actions
   * 
   * @param {Object} storage Data collected from chrome.storage (Extension's options) or local "config.json"
   *
   * @private
   */
   popup: function(storage) {

    var self = this;
  
    // Pre-fill some form elements with data from current web page
    setTimeout(function() {

      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        
        var activeTab = tabs[0];
        // Prefill some fields from page/tab given data
        self.setPostFieldsData(activeTab, ['title', 'url']);
        
        //chrome.tabs.sendMessage(activeTab.id, {"message": "dataFilled"});
      
        // Textareas - autoresize and counter  
        var textareas = document.querySelectorAll('textarea');
        self.autoResize(textareas); 
 
        textareas.forEach(function(textarea) {
          if (textarea.classList.contains('has-counter')) {
            textarea.addEventListener('keyup', function(event) {
              self.textCounter(event.currentTarget, event.currentTarget.nextElementSibling, 255);
            });
          }
        });  
      });

    }, self.timeouts.popup);

    // Now fetch issues for that specific field
    setTimeout(function() {
      var issueXhttpOptions = {
        url: self.config.base_url + '/' +  self.config.entry_point + '/node/issues?filter[status]=1&sort=title' //&page[limit]=200
      };
      self.xhttpOptions = Object.assign(self.xhttpOptions, issueXhttpOptions);
    
      var messageWrappers = document.querySelector('#info');
      var persistErrors = null;
      if (messageWrappers && messageWrappers.children.length) {
        for (var i = 0; i < messageWrappers.children.length; i++ ) {
          if (messageWrappers.children[i].classList.contains('error') || messageWrappers.children[i].classList.contains('warning')) {
            persistErrors = true;
          }
        }
      }
 
      // Send a request for Issues
      // self.asyncRequest('Fetching Issues', 'issues', null, persistErrors);

      // Seems like nothing works on fixed popup height?? 
      //document.querySelector('html').style.height = '1000px';
      //document.querySelector('body').style.height = '1000px';     
    }, self.timeouts.warningDelay);

  },

  /**
   * Options page specific UI definitions and actions
   * 
   * @param {Object} storage Data collected from chrome.storage (Extension's options) or local "config.json"
   *
   * @private
   */
  options: function(storage) {

    if (!storage) {
      storage = this.config;
    }
    var checkboxes = document.querySelectorAll('.checkbox');
    if (checkboxes.length) {
      checkboxes.forEach(function(checkbox) {
        var input = checkbox.querySelector('input');
        var name = input.getAttribute('name');
        if (storage && storage[name]) {
          input.checked = true;
        }
        checkbox.addEventListener('click', function(event) {
          input.checked = !input.checked;
        });
      });
    }
  },
   
  textCounter: function(element, target, limit) {         

    var message = element.parentNode.querySelector('.message') || document.createElement('div');
    message.classList.add('message');
    message.classList.add('inline');

    var valid = true;   

    if (element.value.length > limit) { // Unlikely to happen as long as maxlength="255" attribute is set for textarea in html
      //field.value = field.value.substring(0, maxlimit);
      message.classList.add('message');
      message.classList.add('error');
      
      message.innerHTML = this.messages.textareaLengthInvalid; //'Input is over the limit of characters (Max 255 characters is Drupal\'s limitation for Title field length) and you need to make it shorter.';
      valid = false;
    }
    else {
      message.classList.remove('error');

      if (limit - element.value.length == 0)  {
        message.innerHTML = 'Warning: <strong>' + parseInt(limit - element.value.length) + '</strong> ' + this.messages.textareaLength; //characters left (Max 255 characters is Drupal\'s limitation for Title field length). The original text may be trimmed.';
        message.classList.add('warning');
        document.querySelector('[name="save"]').removeAttribute('disabled');
      }
      else if (limit - element.value.length == -1) {
        message.innerHTML = 'Error: <strong>' + parseInt(limit - element.value.length) + '</strong> ' + this.messages.textareaLength; //characters left (Max 255 characters is Drupal\'s limitation for Title field length). The original text may be trimmed.';
        message.classList.add('error');
        document.querySelector('[name="save"]').setAttribute('disabled', 'disabled');
      }
      else {
        document.querySelector('[name="save"]').removeAttribute('disabled');
        message.innerHTML = 'OK: <em>' + parseInt(limit - element.value.length) + '</em> characters left';
        message.classList.remove('warning');
      }
    }
  
    if (element.parentNode.querySelector('.message') == null) {
      element.parentNode.appendChild(message);
      return valid;
    }
    else {
      return true;
    }
  },

  save: function(event) {
    var self = this;
    var formData = Object.fromEntries(new FormData(document.querySelector('form#drupal-scrapper')).entries());
    var multiSelect = document.getElementById('issues');
    if (multiSelect && multiSelect.hasAttribute('multiple')) {

      var multiSelectData = [];
      for (var i = 0; i < multiSelect.options.length; i++) {
        if (multiSelect.options[i].selected) {
          multiSelectData.push(multiSelect.options[i].value); //data+= "&" + select.name + '=' + options[i].value;
        }
      }
      formData.issues = multiSelectData;
    }

    var data = Object.assign(this.config, formData);
    var errors = [];

    // Access denied: Missing username/password on extension options config as well as in popup form  
    if (!this.userStatus) {
      if (!data.name || !data.pass) {
        var error = this.messages.unauthorized.replace('@drupalLogin', this.config.base_url + '/user/login'); 
        errors.push({ status: 'Error: ', title: error, type: 'error' });
      }
    }

    var formItems = document.querySelectorAll('.form-element');
    formItems.forEach(function(formItem, index) {
      var name = formItem.getAttribute('name');
      if (name === 'title') {
        var title = self.textCounter(formItem, formItem.nextElementSibling, 255); 
        if (!title || (title && title != true)) {
          errors.push({status: 'Validation failed', title: '<em>' + formItem.previousElementSibling.textContent + ' ' + this.textareaLengthInvalid});
        }  
      }

      if (formItem.getAttribute('required') && !data[name]) {
        errors.push({ status: 'Validation failed', title: '<em>' + formItem.previousElementSibling.textContent + '</em> field is mandatory' }); 
      }
    });
    
    if (errors.length) {
      if (this.loginDetails) { 
        this.loginDetails.setAttribute('open', true); 
      }
      window.scrollTo(0, 0);
      this.error(errors);
      return false;
    }

    this.xhttpData = this.defineNode(data);
    
    var xhttpOptions = {
     method: 'POST',
     url: this.config.base_url + '/' + this.config.entry_point + '/node/' + this.config.content_type,
     data: this.xhttpData,
   };
   this.xhttpOptions = Object.assign(this.xhttpOptions, xhttpOptions);
  
   var hasToken = false;
   this.xhttpOptions.headers.post.forEach(function(header) {
     if (header.key === 'X-CSRF-Token') {
       hasToken = true;
     }
   });
  
    window.scrollTo(0, 0);

   if (!hasToken) {
     //alert(this.token);
     //alert(this.userStatus);
     this.xhttpOptions.headers.post.push({key: 'X-CSRF-Token', value: this.token});
   }
   
   // User is not logged in Drupal (in browser), cookie authentication failed 
    var hasAuthorizationHeader = false;
    this.xhttpOptions.headers.post.forEach(function(header) {
      if (header.key === 'Authorization') {
        hasAuthorizationHeader = true;
      }
    });
   
    console.log(this.userStatus, data);
    //var authorization;
    if (!this.userStatus) {
      if (data.name && data.pass) {
        self.userStatus = btoa(unescape(encodeURIComponent(data.name + ':' + data.pass)));
        self.login(data, 'save');
      }
    }
    else {
      //authorization = this.userStatus;
      if (!hasAuthorizationHeader) {
        this.xhttpOptions.headers.post.push({key: 'Authorization', value: 'Basic ' + this.userStatus});
      }
      
      if (data.emails) {
        this.asyncRequest('Posting data', 'share');
      }
      else {
        this.asyncRequest('Posting data', 'status');  
      }
    } 
     /*
    if (!this.userStatus && data.name && data.pass) {
     // Try granting access via basic auth assuming username/password fields are filled and basic_auth module is enabled in Drupal
     //if (!hasAuthorizationHeader) {
       authorization = unescape(encodeURIComponent(data.name + ':' + data.pass));
      // this.xhttpOptions.headers.post.push({key: 'Authorization', value: 'Basic ' + btoa(authorization)});
     //}
   }
   else {
   }
   if (this.userStatus && data.name && data.pass) {
     if (!hasAuthorizationHeader) {
       this.xhttpOptions.headers.post.push({key: 'Authorization', value: 'Basic ' + this.userStatus});
     }
   }
   else if (this.userStatus && (!data.name || !data.pass)) {
     if (!hasAuthorizationHeader) {
       this.xhttpOptions.headers.post.push({key: 'Authorization', value: 'Basic ' + this.userStatus});
     }
   }
*/

  

   //this.asyncRequest('Posting data', 'share');
      
  },

  /**
   * When a user clicks the button, this method is called
   * Button's "name" attribute defines callback to execute
   *
   * @param {Event} event A click event
   *
   * @private
   */
  handleClick: function(event) {

    var callback =  event.target.getAttribute('name');
   
    if (callback) {
      event.preventDefault();
      window.scrapperController[callback](event);
    }
  }

};

/*
// RESTfull type of object
  var newNode = {
    _links: {
      type: {
        href: 'http://dw.absurd.services/rest/type/node/issue_updates'
      }
    },
    type: {
      target_id: 'issue_updates'
    },
    title: {
      value: 'Example node title'
    }
  }; 

  let options = {
    url: 'http://dw.absurd.services/entity/node?_format=hal_json',
    type:'POST',
    headers: {
      'Content-Type': 'application/hal+json',
      'X-CSRF-Token': token
    },
    data: JSON.stringify(newNode),
  };
  ajax(options, postNode);
 
  var ajax = function(options, callback) {
  var xhr;
  xhr = new XMLHttpRequest();
  xhr.open(options.type, options.url, options.async || true);
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      return callback(xhr); //.responseText);
    }
  };
  return xhr.send();
};
*/