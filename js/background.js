'use strict';

chrome.runtime.onInstalled.addListener(function() {
  //chrome.tabs.create({
  //  url: 'https://mail.google.com',
  //  active: true
 // });
  //window.open(chrome.runtime.getURL('html/options.html'));

  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  }
  return false;
});

document.addEventListener('DOMContentLoaded', function(event) {
  //console.log(event);
  // chrome.runtime.sendMessage({initSome: 'Yeah'});
});



/*
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.message === "dataFilled" ) {
    console.log(request, sender, sendResponse);
  }
});
*/