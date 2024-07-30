import os
import json
import boto3

lambda_client = boto3.client('lambda')
api_client = boto3.client('apigatewaymanagementapi')


def send_message(connection_id, message):
    api_client.post_to_connection(
        ConnectionId=connection_id,
        Data=json.dumps(message).encode('utf-8')
    )

def handle_connect(connection_id):
    print(f"New Cconnection: {connection_id}")
    return {'statusCode': 200, 'body': 'Connected'}

def handle_disconnect(connection_id):
    print(f"Disconnected: {connection_id}")
    return {'statusCode': 200, 'body': 'Disconnected'}

def handle_message(event, connection_id):
    response_function_arn = os.environ['RESPONSE_FUNCTION_ARN']

    prompt = json.loads(event.get('body', '{}')).get('prompt')
    language = json.loads(event.get('body', '{}')).get('Language')
    
    print("Language from request: [" + language + "]")
    print("Prompt from user: [" + prompt + "]")
    
    input = {
        "prompt": prompt,
        "connectionId": connection_id,
        "language": language
    }

    lambda_client.invoke(
        FunctionName=response_function_arn,
        InvocationType='Event',
        Payload=json.dumps(input)
    )
    
    return {'statusCode': 200, 'body': 'Message processed'}

def lambda_handler(event, context):
    route_key = event.get('requestContext', {}).get('routeKey')
    connection_id = event.get('requestContext', {}).get('connectionId')

    if route_key == '$connect':
        return handle_connect(connection_id)
    elif route_key == '$disconnect':
        return handle_disconnect(connection_id)
    elif route_key in ['$default', 'sendMessage']:
        return handle_message(event, connection_id)
    else:
        return {'statusCode': 400, 'body': 'Unsupported route'}