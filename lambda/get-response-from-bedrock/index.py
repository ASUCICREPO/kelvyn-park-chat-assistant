import os
import json
import boto3

def streamResponseToAPI(response, connectionId):
    url = os.environ['URL']
    gateway = boto3.client("apigatewaymanagementapi", endpoint_url=url)
    print(f"Received response from LLM! Streaming to url: [{url}]")

    #Convert the model specific API response into general packet with start/stop info, here converts from Claude API response (Could be done for any model)
    stream = response.get('body')
    if stream:

        #for each returned token from the model:
        for token in stream:

            #The "chunk" contains the model-specific response
            chunk = token.get('chunk')
            if chunk:
                
                #Decode the LLm response body from bytes
                chunk_text = json.loads(chunk['bytes'].decode('utf-8'))
                
                #Construct the response body based on the LLM response, (Where the generated text starts/stops)
                if chunk_text['type'] == "content_block_start":
                    block_type = "start"
                    message_text = ""
                    
                elif chunk_text['type'] == "content_block_delta":
                    block_type = "delta"
                    message_text = chunk_text['delta']['text']
                    
                elif chunk_text['type'] == "content_block_stop":
                    block_type = "end"
                    message_text = ""

                else:
                    block_type = "blank"
                    message_text = ""
                    
                #Send the response body back through the gateway to the client    
                data = {
                    'statusCode': 200,
                    'type': block_type,
                    'text': message_text
                }
                gateway.post_to_connection(ConnectionId=connectionId, Data=json.dumps(data))

def lambda_handler(event, context):
    connection_id = event["connectionId"]
    prompt = event["prompt"]
    language_code= event["language"]

    kb_id = os.environ['KNOWLEDGE_BASE_ID']
    agent = boto3.client("bedrock-agent-runtime")
    
    if language_code == "EN":
        language = "English"
    else:
        language = "Spanish"
    
    print(f"Question asked: [{prompt}]")
    print(f"Received Language Code: [{language_code}], Output language parameter: [{language}]")
    
    if prompt:
        print(f"Finding in Knowledge Base with ID: [{kb_id}]...")
        query = {"text": prompt}
        kb_response = agent.retrieve(knowledgeBaseId=kb_id, retrievalQuery=query)
        print(f"Received response from Knowledge Base: [{kb_response}]")
        
        print(f"Updating the prompt for LLM...")
        rag_info = "INFORMATION\n\n"
        for response in kb_response["retrievalResults"]:
            rag_info = rag_info + response["content"]["text"] + "\n\n"
        prompt = rag_info + "USER INPUT\n\n" + prompt
        print(f"Updated prompt: [{prompt}]")
    
        bedrock = boto3.client(service_name="bedrock-runtime", region_name="us-west-2")
        
        kwargs = {
            "modelId": "anthropic.claude-3-haiku-20240307-v1:0",
            "contentType": "application/json",
            "accept": "application/json",
            "body": json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1000,
                "system": f"""You are Luisa, a friendly assistant for Kelvyn Park School. Always respond in {language}, even if the query is in another language. Be concise, warm and conversational, like a helpful school staff member.
                            When asked who you are, say: "Hi! I'm Luisa, your guide to Kelvyn Park School. How can I help you today?"
                            Greet users warmly. For general queries, be friendly and offer school-related help. Examples:
                            - "Hello!": "Hello! How can I assist you with Kelvyn Park School today?"
                            - "How are you?": "I'm well, thanks! What would you like to know about our school?"
                            - "Can you help?": "Absolutely! What Kelvyn Park School information do you need?"
                            
                            Guidelines:
                            1. Always respond in {language} language only.
                            2. Use the information from the provided search results to answer questions, but phrase your responses naturally without mentioning phrases like "According to the search results.." or "Based on the information provided..."
                            3. If unsure, politely say so and offer other help.
                            4. Verify user-mentioned information.
                            5. Stay positive and supportive.
                            6. Provide concise answers. Offer to elaborate if the user wants more details.
                            7. Gently redirect non-school topics to school matters.
                            
                            Use these information sources:
                            $search_results$
                            $output_format_instructions$
                            
                            Your goal: Have helpful, natural conversations about Kelvyn Park School in {language}.""",
                "messages": [{
                    "role": "user",
                    "content": [{
                        "type": "text",
                        "text": prompt
                    }]
                }]
            })
        }
        print(f"Sending query to LLM...")
        response = bedrock.invoke_model_with_response_stream(**kwargs)
        streamResponseToAPI(response, connection_id)
        print("Response processing complete!")
    return {
        'statusCode': 200
    }