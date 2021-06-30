## A browser extension for injecting pieces of web pages into remote hosts / endpoints  
Currenly in pre-alpha stage and goes on Chrome only, Firefox to come. It was originally built for Drupal 8/9 as a remote host, filling in particular content type, hence there is Drupal module enclosed here. Additionally it contains a raugh version of "sharing" the current web page, sending emails to previously configured recipients with some data related to the web page.

### Screencast video with a few more information is here: https://nk.absurd.services#nk-scrapper

### To use
On Drupal host:
- Install JSON API Drupal core module on the host website at "/admin/config/services/jsonapi" and set it works for all requests "Accept all JSON:API create, read, update, and delete operations."
- Optionally install "nk_jsonapi" module here that is needed only for sharing via email notifications option, if/when needed. 

In Chrome browser:
- Install development extension in Chrome browser at chrome://extensions/ with a "Developer mode" switched on in top right corner there click on "Load unpacked" button showing now in top-left area and point to directory where plugin is placed (root of manifest.json file)
- You will be automatically redirected to extension options where you should set data related to a JSON API host (Drupal) and a few others