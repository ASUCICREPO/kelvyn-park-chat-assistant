import os
import boto3
import email
import json
import time
from email import policy
import logging
from botocore.exceptions import ClientError
from botocore.config import Config

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize clients
config = Config(read_timeout=1000)
s3 = boto3.client('s3')
bedrock = boto3.client('bedrock-agent')
bedrock_agent = boto3.client('bedrock-agent-runtime')
bedrock_runtime = boto3.client('bedrock-runtime', config=config)
textract = boto3.client('textract')

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

def extract_latest_newsletter(pdf_key):
    logger.info(f"Starting asynchronous text extraction from the PDF...")
    # Start asynchronous job
    textract_response = textract.start_document_text_detection(
        DocumentLocation={
            'S3Object': {
                'Bucket': SOURCE_BUCKET,
                'Name': pdf_key
            }
        }
    )
    job_id = textract_response['JobId']
    logger.info(f"Started asynchronous Textract job with ID: {job_id}")

    # Wait for the job to complete
    while True:
        textract_response = textract.get_document_text_detection(JobId=job_id)
        status = textract_response['JobStatus']
        logger.info(f"Job status: {status}")
        if status in ['SUCCEEDED', 'FAILED']:
            break
        time.sleep(10)  # Wait for 5 seconds before checking again

    if status == 'FAILED':
        logger.error("Textract job failed")
        raise Exception("Textract job failed")

    logger.info(f"Textract job with ID: {job_id} complete!")
    # Extract text from the job results
    full_text = ""
    pages = textract_response['Blocks']
    while True:
        for item in pages:
            if item['BlockType'] == 'LINE':
                full_text += item['Text'] + " "
        
        if 'NextToken' not in textract_response:
            break
        
        textract_response = textract.get_document_text_detection(JobId=job_id, NextToken=textract_response['NextToken'])
        pages = textract_response['Blocks']
    logger.info(f"Extracting latest newsletter from text...")
    newsletters = full_text.split("Pencil It In!")
    if len(newsletters) > 1:
        logger.info(f"Retreived latest newsletter")
        return "Pencil It In!" + newsletters[1]
    logger.info(f"Returning full text")
    return full_text

def generate_summary_xml(previous_summary_content, latest_newsletter):
    prompt = f"""
    <prompt>
        <task>
            You are an AI assistant tasked with summarizing and cleaning school newsletter data. 
            Your goal is to create an up-to-date compilation of all information, particularly focusing on events, important dates, policies, and announcements. This compilation will be used as a knowledge base for a chat assistant that will answer queries from parents and students about the day-to-day activities of the school.
        </task>
        <instructions>
            <step>Keep the length of the output under 1500 words.</step>
            <step>If needed, remove older information from previous summary to stay under 1500 word limit.</step>
            <step>Read through the newsletter content and the previous summary chronologically.</step>
            <step>Update the summary with new information from the current newsletter.</step>
            <step>Keep the summary concise, and focus more on the recent newsletter.</step>
            <step>Retain all the relevant information from the previous summary that is still applicable.</step>

            <step>
            Extract and organize all information into the following categories:
            <categories>
                <category>School Policies and Procedures</category>
                <category>Academic Information</category>
                <category>Upcoming Events (sorted chronologically)</category>
                <category>Extracurricular Activities</category>
                <category>Important Announcements</category>
            </categories>
            </step>

            <step>
            For each piece of information:
            <sub-step>Retain specific dates, times, and locations whenever mentioned.</sub-step>
            <sub-step>If information is updated in later newsletters, use the most recent version.</sub-step>
            </step>

            <step>
            For each School Policy and Procedure:
            <sub-step>Summarize the full content of the policy details in a sentence, not just the title.</sub-step>
            <sub-step>Provide any specific rules, guidelines, or procedures mentioned.</sub-step>
            <sub-step>Include any exceptions or special circumstances related to the policy.</sub-step>
            </step>

            <step>
            For each Important Announcement:
            <sub-step>Summarize the full content of the announcement, not just the heading.</sub-step>
            <sub-step>Provide all details, context, and implications of the announcement.</sub-step>
            <sub-step>Include any action items or responses required from students or parents.</sub-step>
            </step>
            
            <step>
            For events:
            <sub-step>List all events chronologically, including past events from the current school year.</sub-step>
            <sub-step>Include the most up-to-date details (date, time, location, description).</sub-step>
            <sub-step>Retain information about recurring events or series.</sub-step>
            <sub-step>When there are multiple dates for an event, keep track of all the dates for the event in a list chronologically.</sub-step>
            </step>

            <step>Maintain all numerical data, statistics, and specific figures mentioned.</step>

            <step>Preserve mentions of individuals, roles, and responsibilities.</step>

            <step>Keep track of all forms, documents, and resources mentioned, including their purposes and links if provided.</step>

            <step>Retain information about external organizations, partnerships, or visitors to the school.</step>

            <step>
            After creating the compilation:
            <sub-step>Review for any remaining redundancies or contradictions.</sub-step>
            <sub-step>Ensure all information is present in concise manner.</sub-step>
            <sub-step>Format the final compilation for easy readability, using headers, subheaders, and bullet points as necessary.</sub-step>
            </step>
        </instructions>

        <input>
            Current Newsletter Content:
            {latest_newsletter}
            Previous Summary XML:
            {previous_summary_content}
        </input>
        
        <output_request>
            Please provide an updated, comprehensive, chronological compilation of all events, policies, procedures, and important information based on these instructions in less than 1500 words. Use XML tags to structure your response. Ensure that full details of policies, procedures, and announcements are included, not just titles or headings.
        </output_request>
    </prompt>
    """
    
    native_request = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 4000,
        "temperature": 0.1,
        "top_p": 0.9,
        "messages": [
            {
                "role": "user",
                "content": [{"type": "text", "text": prompt}],
            }
        ],
    }
    logger.info(f"Asking Bedrock to generate summary...")
    claude_response = bedrock_runtime.invoke_model(
        modelId='anthropic.claude-3-sonnet-20240229-v1:0',
        body=json.dumps(native_request)
    )
    json_response = json.loads(claude_response['body'].read())
    claude_response_list = json_response['content']
    summary = ""
    for item in claude_response_list:
        summary = summary + "\n" + item['text']
    logger.info(f"Received response from  Bedrock!")
    return summary

def process_newsletter(pdf_content, message_id, file_name_key):
    pdf_key = f"newsletters/{message_id}.pdf"
    logger.info(f"Savinig the Newsletter PDF in [{SOURCE_BUCKET}] at [{pdf_key}]")
    s3.put_object(Bucket=SOURCE_BUCKET, Key=pdf_key, Body=pdf_content)
    
    latest_newsletter = extract_latest_newsletter(pdf_key)
    logger.info(f"Extracted the latest newsletter from PDF!")
    
    logger.info(f"Retrieving the previous summary XML from S3")
    try:
        previous_summary = s3.get_object(Bucket=DESTINATION_BUCKET, Key=file_name_key)
        previous_summary_content = previous_summary['Body'].read().decode('utf-8')
        logger.info(f"Retrieved previous summary from S3")
    except s3.exceptions.NoSuchKey:
        previous_summary_content = "<summary></summary>"
        logger.info(f"No previous summary found, starting fresh")

    summary = generate_summary_xml(previous_summary_content, latest_newsletter)
    return summary

def process_email(message_id, retry_count):
    """Process a single email."""    
    message_key = f"{INCOMING_PREFIX}{message_id}"
    try:
        # Retrieve the email from S3
        logger.info(f"Retreiving object [{message_key}] from [{SOURCE_BUCKET}]...")
        s3_object = s3.get_object(Bucket=SOURCE_BUCKET, Key=message_key)
        email_body = s3_object['Body'].read().decode('utf-8')
        logger.info(f"Parsing the email...")
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
                attachments_added = False
                if HANDBOOK_FILE in file_name:
                    file_name_key = f'{HANDBOOK_FILE}.pdf'
                    s3.put_object(
                        Bucket=DESTINATION_BUCKET,
                        Key=file_name_key,
                        Body=part.get_payload(decode=True)
                    )
                    logger.info(f"Uploaded attachment: [{file_name}] to bucket: [{DESTINATION_BUCKET}] with name: [{file_name_key}]")
                    logger.info(f"Deleting the newsletter summary from the data source...")
                    s3.delete_object(Bucket=DESTINATION_BUCKET, Key=f'{NEWSLETTER_FILE}.txt')
                    logger.info(f"Successfully deleted file {NEWSLETTER_FILE}.txt from {DESTINATION_BUCKET}.")
                    attachments_added = True
                elif NEWSLETTER_FILE in file_name:
                    file_name_key = f'{NEWSLETTER_FILE}.txt'
                    pdf_content = part.get_payload(decode=True)
                    claude_response = process_newsletter(pdf_content, message_id, file_name_key)
                    s3.put_object(
                        Bucket=DESTINATION_BUCKET,
                        Key=file_name_key,
                        Body=claude_response.encode('utf-8'),
                    )
                    logger.info(f"Uploaded attachment: [{file_name}] to bucket: [{DESTINATION_BUCKET}] with name: [{file_name_key}]")
                    attachments_added = True
                else:
                    logger.info(f"Received attachment [{file_name}], ignoring...")
        
        # Sync knowledge base if attachments were added
        if attachments_added:
            logger.info(f"Synching Knowledge Base now...")
            sync_knowledge_base()
        
        # Move the original email to the archive prefix
        archive_key = f"{ARCHIVE_PREFIX}{message_id}"
        logger.info(f"Archiving the email...")
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
            if(retry_count==MAX_RETRIES-1):
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
        logger.info(f"Starting Bedrock Ingestion Job for Knowledge Base [{KNOWLEDGE_BASE_ID}], Data Source: [{DATA_SOURCE_ID}]...")
        response = bedrock.start_ingestion_job(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            dataSourceId=DATA_SOURCE_ID
        )
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
            process_email(message_id, retry_count)
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
        logger.info(f"S3 lifecycle rule setup is disabled.")
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