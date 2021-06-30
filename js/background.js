'use strict';

chrome.runtime.onInstalled.addListener(function() {

  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  }
  return false;
});