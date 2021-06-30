<?php

namespace Drupal\nk_jsonapi\Resource;

use Symfony\Component\Routing\Route;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;

use Drupal\Core\DependencyInjection\ContainerInjectionInterface;
use Drupal\Core\Access\CsrfRequestHeaderAccessCheck;
use Drupal\Core\Access\CsrfTokenGenerator;
use Drupal\Core\Session\AccountInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Mail\MailManagerInterface;
use Drupal\Core\Cache\CacheableMetadata;

use Drupal\Component\Serialization\Json;

use Drupal\user\UserInterface;
use Drupal\jsonapi\JsonApiResource\LinkCollection;
use Drupal\jsonapi\ResourceType\ResourceType;
use Drupal\jsonapi\ResourceType\ResourceTypeAttribute;
use Drupal\jsonapi\JsonApiResource\ResourceObject;
use Drupal\jsonapi\JsonApiResource\ResourceObjectData;

use Drupal\jsonapi_resources\Resource\ResourceBase;

/**
 * Processes a request for the authenticated user's information.
 *
 * @internal
 */
class Share extends ResourceBase implements ContainerInjectionInterface {

  /**
   * The entity type manager.
   *
   * @var \Drupal\Core\Entity\EntityTypeManagerInterface
   */
  protected $entityTypeManager;

  /**
   * The current user account.
   *
   * @var \Drupal\Core\Session\AccountInterface
   */
  protected $currentUser;

  /**
   * The CSRF token generator.
   *
   * @var \Drupal\Core\Access\CsrfTokenGenerator
   */
  protected $tokenGenerator;

  protected $mailManager;

  protected $requestStack;
  
  /**
   * Constructs a new EntityResourceBase object.
   *
   * @param \Drupal\Core\Entity\EntityTypeManagerInterface $entity_type_manager
   *   Tne entity type manager.
   * @param \Drupal\Core\Session\AccountInterface $account
   *   The current user.
   * @param \Drupal\Core\Access\CsrfTokenGenerator $token_generator
   *   The CSRF token generator.
   */
  public function __construct(EntityTypeManagerInterface $entity_type_manager, AccountInterface $account, CsrfTokenGenerator $token_generator, MailManagerInterface $mail_manager, RequestStack $request_stack) {
    $this->entityTypeManager = $entity_type_manager;
    $this->currentUser = $account;
    $this->tokenGenerator = $token_generator;
    $this->mailManager = $mail_manager;
    $this->requestStack = $request_stack;
  }

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container) {
    return new static(
      $container->get('entity_type.manager'),
      $container->get('current_user'),
      $container->get('csrf_token'),
      $container->get('plugin.manager.mail'),
      $container->get('request_stack')
    );
  }
  
  /**
   * Process the resource request.
   *
   * @param \Symfony\Component\HttpFoundation\Request $request
   *   The request.
   * @param \Drupal\jsonapi\ResourceType\ResourceType[] $resource_types
   *   The route resource types.
   *
   * @return \Drupal\jsonapi\ResourceResponse
   *   The response.
   *
   * @throws \Drupal\Component\Plugin\Exception\InvalidPluginDefinitionException
   * @throws \Drupal\Component\Plugin\Exception\PluginNotFoundException
   */
  public function process(Request $request, array $resource_types) {
    $user_storage = $this->entityTypeManager->getStorage('user');
    $current_user = $user_storage->load($this->currentUser->id());
    assert($current_user instanceof UserInterface);
    $resource_type = reset($resource_types);

    $links = new LinkCollection([]);
    $primary_data = new ResourceObject(
      $current_user,
      $resource_type,
      $current_user->uuid(),
      NULL,
      [
        'share' => $current_user->getDisplayName(),
        'roles' => $current_user->getRoles(TRUE),
        'shareWith' => 'Oh yes',
        'token' => $this->tokenGenerator->get(CsrfRequestHeaderAccessCheck::TOKEN_KEY),
      ],
      $links
    );

    $content = $request->getContent();
    $data = $content ? Json::decode($content) : []; 

    $response_data = new ResourceObjectData([$primary_data], 1);
    $response = $this->createJsonapiResponse($response_data, $request);
    $response->addCacheableDependency((new CacheableMetadata())->addCacheContexts(['user']));

    if (isset($data['emails']) && !empty($data['emails'])) {
      $email_data = [
       'name' => $current_user->getDisplayName(),
       'subject' => str_replace(['@title', '@name'], [$data['title'], $current_user->getDisplayName()], $data['email_subject']), //'An article shared',
       'to' => $data['emails'],
       'body' => isset($data['url']) && !empty($data['url']) ? $data['url'] : $data['title']
      ];
      return $this->constructMail($email_data, $current_user, $response);
    }
    else {
      return $response;
    }

  }

  /**
   * {@inheritdoc}
   */
  public function getRouteResourceTypes(Route $route, string $route_name): array {
    $fields = [
      'shared' => new ResourceTypeAttribute('shared'),
      'sharedWith' => new ResourceTypeAttribute('sharedWith'),
      'token' => new ResourceTypeAttribute('token'),
    ];
    $resource_type = new ResourceType('share', 'share', NULL, FALSE, TRUE, TRUE, FALSE, $fields);
    // @todo: Add role entities as a relatable resource type.
    $resource_type->setRelatableResourceTypes([]);
    return [$resource_type];
  }


  protected function constructMail($data, $current_user, $response) {
  
    /*
    // Set a reply-to value
    $reply_to = $data['reply_to'];
  
    // Set a from value
    $from = $data['from'];
  
    // Set a subject
    $subject = $data['subject'];
  
    // Set a sender name
    $sender_name = $data['sender_name'];
  
    // Set a recipient email
    $to = $data['to'];
  
    // Set your message body
    $body = $data['body'];
  
    // Use the theme to send the message
    $theme_body = array(
      '#theme' => 'nk_jsonapi_email',
      '#text' => $body,
      '#sender_name' => $sender_name,
    );
  
    // Set up the Drupal Mail manager
    //$mailManager = \Drupal::service('plugin.manager.mail');
  
    // Tell the mail system what module you are sending this from
    $module = 'nk_jsonapi';
  
    // Set up the parameters for your email from the variables
    $params['message'] = 'Oh. cool'; //drupal_render($theme_body);
    
    // Set some header information
    $params['headers'] = [
      'content-type' => 'text/html',
      'MIME-Version' => '1.0',
      'reply-to' => 'dev@dev.com',
      'from' => $sender_name .' <' . $from . '>',
      'Return-Path' => $sender_name .' <' . $from . '>',
    ];
    $params['from'] = $from;
    $params['reply-to'] = 'dev@dev.com';
    $params['subject'] = $subject;
    
    // Need to attach a file? Maybe uploaded through a form
    if (isset($data['attach']) && !empty($data['attach'])) {
      $file_info = array();
      $file_info['filepath'] = $data['attach']['uri']; // File path
      $file_info['filename'] = $data['attach']['filename']; //File name
      $file_info['filemime'] = $data['attach']['filemime']; //File mime type
      $params['attachments'][] = $file_info;
    }
    
    // Set a key so you can send different types of message
    $key = 'nk_jsonapi_mail';
   */
  
    /*
    $params['headers'] = [
      'content-type' => 'text/html',
      'MIME-Version' => '1.0',
      'reply-to' => 'dev@dev.com',
      'from' => 'Test user <dev@dev.com>', //$sender_name .' <' . $from . '>',
      'Return-Path' => 'Test user <dev@dev.com>', //$sender_name .' <' . $from . '>',
    ];
    */

    // Get the language code from your site
    $langcode = $current_user->getPreferredLangcode(); // \Drupal::currentUser()->getPreferredLangcode();
  
    // Set sending to true in case there is other logic that needs to happen before
    $send = TRUE;
  
    // Send the E-Mail
    //$params['account'] = $current_user;

    $result = $this->mailManager->mail('nk_jsonapi', 'nk_jsonapi_mail', $data['to'], $langcode, $data); //, NULL, $send);
    if ($result['result']) {
      return $response;
    } 
    return $response;
  }

}
