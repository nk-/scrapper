'use strict';

chrome.runtime.onInstalled.addListener(function() {

  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  }
  return false;
});

/*
document.addEventListener('DOMContentLoaded', function(event) {
  console.log(event);
  chrome.runtime.sendMessage({initSome: 'Yeah'});
});
*/