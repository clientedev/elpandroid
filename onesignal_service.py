import os
import logging
import requests
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

class OneSignalService:
    """
    Service for sending push notifications via OneSignal REST API
    """
    
    def __init__(self):
        self.app_id = os.environ.get('ONESIGNAL_APP_ID')
        self.rest_api_key = os.environ.get('ONESIGNAL_REST_API_KEY')
        self.api_url = "https://onesignal.com/api/v1/notifications"
        
        if not self.app_id or not self.rest_api_key:
            logger.error("❌❌❌ ONESIGNAL CREDENTIALS NOT CONFIGURED ❌❌❌")
            logger.error(f"ONESIGNAL_APP_ID: {'SET' if self.app_id else 'NOT SET'}")
            logger.error(f"ONESIGNAL_REST_API_KEY: {'SET' if self.rest_api_key else 'NOT SET'}")
            self.enabled = False
        else:
            self.enabled = True
            logger.info(f"✅ OneSignal service initialized (App ID: {self.app_id[:10]}...)")
    
    def send_notification(
        self, 
        player_id: str, 
        title: str, 
        message: str, 
        data: Optional[Dict] = None,
        url: Optional[str] = None
    ) -> Dict:
        """
        Send a push notification to a single user by player ID
        
        Args:
            player_id: OneSignal player ID of the user
            title: Notification title
            message: Notification message/body
            data: Optional data to send with notification
            url: Optional URL to open when notification is clicked
            
        Returns:
            Dict with success status and response data
        """
        if not self.enabled:
            logger.debug("OneSignal disabled - skipping notification")
            return {'success': False, 'error': 'OneSignal not configured'}
        
        if not player_id:
            logger.warning("⚠️ Cannot send notification - player_id is empty")
            return {'success': False, 'error': 'No player ID provided'}
        
        return self.send_notification_to_many(
            player_ids=[player_id],
            title=title,
            message=message,
            data=data,
            url=url
        )
    
    def send_notification_to_many(
        self,
        player_ids: List[str],
        title: str,
        message: str,
        data: Optional[Dict] = None,
        url: Optional[str] = None
    ) -> Dict:
        """
        Send a push notification to multiple users by player IDs
        
        Args:
            player_ids: List of OneSignal player IDs
            title: Notification title
            message: Notification message/body
            data: Optional data to send with notification
            url: Optional URL to open when notification is clicked
            
        Returns:
            Dict with success status and response data
        """
        if not self.enabled:
            logger.debug("OneSignal disabled - skipping notification")
            return {'success': False, 'error': 'OneSignal not configured'}
        
        if not player_ids or len(player_ids) == 0:
            logger.warning("⚠️ Cannot send notification - player_ids list is empty")
            return {'success': False, 'error': 'No player IDs provided'}
        
        # Filter out None/empty player IDs
        valid_player_ids = [pid for pid in player_ids if pid]
        if not valid_player_ids:
            logger.warning("⚠️ All player IDs were invalid/empty")
            return {'success': False, 'error': 'No valid player IDs'}
        
        try:
            headers = {
                'Content-Type': 'application/json; charset=utf-8',
                'Authorization': f'Basic {self.rest_api_key}'
            }
            
            payload = {
                'app_id': self.app_id,
                'include_player_ids': valid_player_ids,
                'headings': {'en': title},
                'contents': {'en': message},
                'web_push_topic': 'system-notifications'
            }
            
            # Add custom data if provided
            if data:
                payload['data'] = data
            
            # Add URL for web push (use web_url only, not url)
            if url:
                payload['web_url'] = url
            
            # Add icons with ABSOLUTE URLs (OneSignal requires full URLs)
            payload['chrome_web_icon'] = 'https://elpconsultoria.pro/static/icons/icon-192x192.png'
            payload['chrome_web_badge'] = 'https://elpconsultoria.pro/static/icons/icon-72x72.png'
            payload['firefox_icon'] = 'https://elpconsultoria.pro/static/icons/icon-192x192.png'
            
            # Send request
            response = requests.post(
                self.api_url,
                json=payload,
                headers=headers,
                timeout=10
            )
            
            response_data = response.json()
            
            if response.status_code == 200:
                recipients = response_data.get('recipients', 0)
                
                # Enhanced logging for diagnostics
                if recipients == 0:
                    logger.warning("="*50)
                    logger.warning(f"⚠️ ONESIGNAL RETURNED 0 RECIPIENTS")
                    logger.warning(f"Full Response: {response_data}")
                    
                    invalid_ids = response_data.get('invalid_player_ids')
                    if invalid_ids:
                         logger.warning(f"⚠️ The following Player IDs were rejected: {invalid_ids}")
                         
                    errors = response_data.get('errors')
                    if errors:
                         logger.error(f"❌ OneSignal Business Errors: {errors}")
                    logger.warning("="*50)
                else:
                    logger.info(f"✅ OneSignal notification sent successfully to {recipients} device(s)")
                
                return {
                    'success': True,
                    'response': response_data,
                    'recipients': recipients
                }
            else:
                error_msg = response_data.get('errors', ['Unknown error'])[0]
                logger.error(f"❌ OneSignal API error: {error_msg}")
                return {
                    'success': False,
                    'error': error_msg,
                    'response': response_data
                }
                
        except requests.exceptions.Timeout:
            logger.error("❌ OneSignal API request timeout")
            return {'success': False, 'error': 'Request timeout'}
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ OneSignal API request failed: {e}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"❌ Unexpected error sending OneSignal notification: {e}")
            return {'success': False, 'error': str(e)}
    
    def send_notification_to_all(
        self,
        title: str,
        message: str,
        data: Optional[Dict] = None,
        url: Optional[str] = None
    ) -> Dict:
        """
        Send a push notification to all subscribed users
        
        Args:
            title: Notification title
            message: Notification message/body
            data: Optional data to send with notification
            url: Optional URL to open when notification is clicked
            
        Returns:
            Dict with success status and response data
        """
        if not self.enabled:
            logger.debug("OneSignal disabled - skipping notification")
            return {'success': False, 'error': 'OneSignal not configured'}
        
        try:
            headers = {
                'Content-Type': 'application/json; charset=utf-8',
                'Authorization': f'Basic {self.rest_api_key}'
            }
            
            payload = {
                'app_id': self.app_id,
                'included_segments': ['Subscribed Users'],
                'headings': {'en': title},
                'contents': {'en': message}
            }
            
            # Add custom data if provided
            if data:
                payload['data'] = data
            
            # Add URL for web push (use web_url only)
            if url:
                payload['web_url'] = url
            
            # Add icons with ABSOLUTE URLs
            payload['chrome_web_icon'] = 'https://elpconsultoria.pro/static/icons/icon-192x192.png'
            payload['chrome_web_badge'] = 'https://elpconsultoria.pro/static/icons/icon-72x72.png'
            payload['firefox_icon'] = 'https://elpconsultoria.pro/static/icons/icon-192x192.png'
            
            # Send request
            response = requests.post(
                self.api_url,
                json=payload,
                headers=headers,
                timeout=10
            )
            
            response_data = response.json()
            
            if response.status_code == 200:
                recipients = response_data.get('recipients', 0)
                logger.info(f"✅ OneSignal broadcast sent successfully to {recipients} device(s)")
                return {
                    'success': True,
                    'response': response_data,
                    'recipients': recipients
                }
            else:
                error_msg = response_data.get('errors', ['Unknown error'])[0]
                logger.error(f"❌ OneSignal API error: {error_msg}")
                return {
                    'success': False,
                    'error': error_msg,
                    'response': response_data
                }
                
        except Exception as e:
            logger.error(f"❌ Error sending OneSignal broadcast: {e}")
            return {'success': False, 'error': str(e)}


# Create singleton instance
onesignal_service = OneSignalService()
