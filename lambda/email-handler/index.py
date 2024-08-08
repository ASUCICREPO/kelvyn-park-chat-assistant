import os
import boto3
import email
from email import policy
import logging
from botocore.exceptions import ClientError

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize clients
s3 = boto3.client('s3')
bedrock = boto3.client('bedrock-agent')

# Constants
SOURCE_BUCKET = os.environ['SOURCE_BUCKET_NAME']
DESTINATION_BUCKET = os.environ['DESTINATION_BUCKET_NAME']
KNOWLEDGE_BASE_ID = os.environ['KNOWLEDGE_BASE_ID']
DATA_SOURCE_ID = os.environ['DATA_SOURCE_ID']
INCOMING_PREFIX = 'incoming/'
ARCHIVE_PREFIX = 'archive/'
ERROR_PREFIX = 'processing_errors/'
MAX_RETRIES = int(os.environ['MAX_RETRIES'])
ENABLE_LIFECYCLE_RULE = os.environ.get('ENABLE_LIFECYCLE_RULE', 'false').lower() == 'true'
HANDBOOK_FILE = "HANDBOOK - Students & Parents"
NEWSLETTER_FILE = "Pencil It In"

def process_email(message_id):
    """Process a single email."""    
    message_key = f"{INCOMING_PREFIX}{message_id}"
    try:
        # Retrieve the email from S3
        logger.info(f"Retreiving object [{message_key}] from [{SOURCE_BUCKET}]...")
        s3_object = s3.get_object(Bucket=SOURCE_BUCKET, Key=message_key)
        email_body = s3_object['Body'].read().decode('utf-8')
        logger.info("Parsing the email...")
        msg = email.message_from_string(email_body, policy=policy.default)
        attachments_added = False
        
        # Process attachments
        for part in msg.walk():
            if part.get_content_maintype() == 'multipart':
                continue
            if part.get('Content-Disposition') is None:
                continue
            
            file_name = part.get_filename()
            if file_name:
                logger.info(f"E-mail contains attachment with name [{file_name}]")
                # Upload attachment to destination S3 bucket
                file_name_key=file_name
                if HANDBOOK_FILE in file_name:
                    file_name_key = HANDBOOK_FILE
                elif NEWSLETTER_FILE in file_name:
                    file_name_key = NEWSLETTER_FILE
                s3.put_object(
                    Bucket=DESTINATION_BUCKET,
                    Key=file_name_key,
                    Body=part.get_payload(decode=True)
                )
                logger.info(f"Uploaded attachment: [{file_name}] to bucket: [{DESTINATION_BUCKET}] with name: [{file_name_key}]")
                attachments_added = True
        
        # Sync knowledge base if attachments were added
        if attachments_added:
            logger.info("Synching Knowledge Base now...")
            sync_knowledge_base()
        
        # Move the original email to the archive prefix
        archive_key = f"{ARCHIVE_PREFIX}{message_id}"
        logger.info("Archiving the email...")
        s3.copy_object(
            Bucket=SOURCE_BUCKET,
            CopySource={'Bucket': SOURCE_BUCKET, 'Key': message_key},
            Key=archive_key
        )
        s3.delete_object(Bucket=SOURCE_BUCKET, Key=message_key)
        logger.info(f"Processed email [{message_key}] and moved to archive: [{archive_key}]")
        
    except Exception as e:
        logger.exception(f"Error processing email [{message_key}]: {str(e)}")
        # Move the problematic email to an error prefix
        try:
            s3.copy_object(
                Bucket=SOURCE_BUCKET,
                CopySource={'Bucket': SOURCE_BUCKET, 'Key': message_key},
                Key=f"{ERROR_PREFIX}{message_id}"
            )
            s3.delete_object(Bucket=SOURCE_BUCKET, Key=message_key)
            logger.info(f"Moved problematic email [{message_key}] to error prefix: [{message_key}]")
        except Exception as copy_error:
            logger.exception(f"Error moving problematic email: {str(copy_error)}")
        raise

def sync_knowledge_base():
    """Sync the knowledge base."""
    try:
        logger.info("Starting Bedrock Ingestion Job for Knowledge Base [{KNOWLEDGE_BASE_ID}], Data Source: [{DATA_SOURCE_ID}]...")
        response = bedrock.start_ingestion_job(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            dataSourceId=DATA_SOURCE_ID
        )
        logger.info(response)
        logger.info(f"Started knowledge base sync: {response['ingestionJob']['ingestionJobId']}")
    except ClientError as e:
        logger.exception(f"Error syncing knowledge base: {str(e)}")

def lambda_handler(event, context):
    # Get the email data from the SES event
    ses_notification = event['Records'][0]['ses']
    message_id = ses_notification['mail']['messageId']
    logger.info(f"Received email with Message ID: [{message_id}]")
    retry_count = 0
    while retry_count < MAX_RETRIES:
        try:
            process_email(message_id)
            return {
                'statusCode': 200,
                'body': 'Email processed successfully'
            }
        except Exception as e:
            retry_count += 1
            logger.warning(f"Attempt {retry_count} failed. Retrying... Error: {str(e)}")
    
    logger.error(f"Failed to process email after {MAX_RETRIES} attempts")
    return {
        'statusCode': 500,
        'body': f'Error processing email after {MAX_RETRIES} attempts'
    }

def setup_s3_lifecycle_rule(enable=False):
    """Set up S3 lifecycle rule for the source bucket."""
    if not enable:
        logger.info("S3 lifecycle rule setup is disabled.")
        return

    try:
        s3.put_bucket_lifecycle_configuration(
            Bucket=SOURCE_BUCKET,
            LifecycleConfiguration={
                'Rules': [
                    {
                        'ID': 'Delete archived emails',
                        'Status': 'Enabled',
                        'Prefix': ARCHIVE_PREFIX,
                        'Expiration': {'Days': 7}  # Adjust the number of days as needed
                    },
                    {
                        'ID': 'Delete error emails',
                        'Status': 'Enabled',
                        'Prefix': ERROR_PREFIX,
                        'Expiration': {'Days': 7}  # Adjust the number of days as needed
                    },
                    {
                        'ID': 'Delete stale unprocessed emails',
                        'Status': 'Enabled',
                        'Prefix': INCOMING_PREFIX,
                        'Expiration': {'Days': 15}  # Adjust the number of days as needed
                    },
                ]
            }
        )
        logger.info(f"Set up lifecycle rules for bucket: {SOURCE_BUCKET}")
    except ClientError as e:
        logger.exception(f"Error setting up lifecycle rules: {str(e)}")

setup_s3_lifecycle_rule(ENABLE_LIFECYCLE_RULE)