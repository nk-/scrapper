'use strict';


if (document.readyState !== 'complete') {
  window.addEventListener('load', scrapperInit());
}
else {
  scrapperInit();
}


function scrapperInit() {
/*
  var metaTitle = document.querySelector('meta[property="og:title"]'); 
  //document.querySelector('#article'); //$("a[href^='http']").eq(0).attr("href");
  //<meta property="og:title" content="Coronavirus: number of confirmed UK cases rises from four to eight">
  console.log(metaTitle);
  chrome.runtime.sendMessage({
    title: metaTitle
  });
*/
}