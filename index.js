const AWS = require('aws-sdk');
const { WebClient } = require("@slack/web-api");
const { extractValue, wait, getCurrentDiskUsage, resizeFileSystem } = require('utils');

//Set snsTopicARN and slackChannel variables
const snsTopicARN = '';
const slackChannel = '';
const deviceName = ''; //eg. '/dev/sdf'

exports.handler = async (event) => { 
 console.log(`Lambda triggered by event: ${JSON.stringify(event)}`);

 const slackClient = new WebClient(process.env.SLACK_TOKEN, {
  retryConfig: { retries: 0 }
 });

 const sns = new AWS.SNS();
 const sts = new AWS.STS();
 
 const 
  expectedAlertName = 'Disk Usage',
  alertname = event.alerts[0].labels.alertname,
  value = event.alerts[0].valueString,
  accounts = {
    "account1": '111111111111',
  	"account2": '222222222222',
  	"account3": '333333333333'
  },
  regionsMap = {
   "us": 'us-east-1',
   "eu": 'eu-west-1',
   "ap": 'ap-southeast-1'
  }

 if(alertname === expectedAlertName) {
  const 
   region = extractValue('region', value),
   account = extractValue('account', value),
   instanceIP = extractValue('instance', value),
   device = extractValue('device', value);
   
  console.log(`\nRegion: ${region}\nChain: ${account}\nInstance IP: ${instanceIP}\nDevice: ${device}`);
  
  //Assume Role of AWS account
  const assumeRole = await sts.assumeRole({
   RoleArn: `arn:aws:iam::${accounts[account]}:role/EBSDiskManagement`,
   RoleSessionName: 'EBSDiskManagement',
   DurationSeconds: 900
  }).promise();
  const assumeRoleData = {
   accessKeyId: assumeRole.Credentials.AccessKeyId,
   secretAccessKey: assumeRole.Credentials.SecretAccessKey,
   sessionToken: assumeRole.Credentials.SessionToken,
   region: regionsMap[region]
  };  
  
  const ec2 = new AWS.EC2(assumeRoleData);
  const ssm = new AWS.SSM(assumeRoleData);  
  
  //Get Instance ID and volume ID based on IP address of the instance.
  const { Reservations:[ { Instances:[ { InstanceId:instanceId, BlockDeviceMappings:devices }]}]} = await ec2.describeInstances({
   Filters: [
    {
     Name: "ip-address", 
     Values: [instanceIP]
    }
   ]
  }).promise();
  const volumeId = devices.filter(device => device.DeviceName === deviceName)[0].Ebs.VolumeId;
  console.log(`\nInstance ID: ${instanceId}\nVolume ID: ${volumeId}`);
  
  //Get current percetage usage of the disk
  const currentPercentageUsage = await getCurrentDiskUsage(ssm, instanceId, device);
  console.log(`Current percentage disk usage: ${currentPercentageUsage}`);

  //Check if current percetage usage of the disk is bigger or equal percetage usage limit
  if(currentPercentageUsage >= Number(process.env.PERCETAGE_USAGE_LIMIT)) {
    const { ts:thread } = await slackClient.chat.postMessage(
    { 
     channel: slackChannel,
     text: `Automated EBS volume increase and file system resize was started :progress:
     
Account: ${account}
Region: ${region}
InstanceId: ${instanceId}
Current disk usage: ${currentPercentageUsage}%
Size increase: ${process.env.INCREASE_VOLUME_VALUE}GB` 
    }
   );
   
   try {
    //Get current size of volume
    const { Volumes: [{ Size:currentSize }] } = await ec2.describeVolumes({
      Filters: [
       {
        Name: "volume-id", 
        Values: [volumeId]
       }
      ]
    }).promise();
   
    //Increase volume size
    let targetSize = currentSize + Number(process.env.INCREASE_VOLUME_VALUE);
    console.log(`Current EBS volume size: ${currentSize}\nTarget EBS volume size: ${targetSize}`);
    
    await ec2.modifyVolume({
       VolumeId: volumeId,
       Size: targetSize,
    }).promise();
    
    //Wait for volume to be in 'optimizing' or 'completed' state
    let state = 'modifying';
    while(state == 'modifying') {
     ({ VolumesModifications: [{ ModificationState:state }] } = await ec2.describeVolumesModifications({
      Filters: [
       {
        Name: "volume-id", 
        Values: [volumeId]
       },
       {
        Name: "target-size", 
        Values: [`${targetSize}`]
       }
      ]
     }).promise());
     console.log(`Volume modification state: ${state}`);
     await wait(5000);
    }
   
    //Resize filesystem
    console.log('Resizing filesystem...');
    await resizeFileSystem(ssm, instanceId, device);
    
    await wait();
    
    //Get new percentage usage
    const newPercentageUsage = await getCurrentDiskUsage(ssm, instanceId, device);
    console.log(`New percetage usage of disk: ${newPercentageUsage}`);
    
    await slackClient.chat.postMessage(
     { 
      channel: slackChannel,
      thread_ts: thread, 
      text: `Increase SUCCESSFUL :white_check_mark:

New disk size: ${targetSize}GB 
New disk usage: ${newPercentageUsage}%
     `  
     }
    );
    
    //If new percentage usage is still below percentgae usage limit, inform DevOps team
    if(newPercentageUsage >= Number(process.env.PERCETAGE_USAGE_LIMIT)) {
     await sns.publish({
      Message: `Increased EBS volume ${volumeId} of instance ${instanceId} is still below usage limit. \nAccount: ${account} \nRegion: ${region}\n`,
      Subject: 'EBS volume size below acceptable limit',
      TopicArn: snsTopicARN
     }).promise();   
    } 
   } catch (error) {
      await sns.publish({
       Message: `Failed to increase EBS volume ${volumeId} of instance ${instanceId}. \nAccount: ${account} \nRegion: ${region}\n
       Error: ${JSON.stringify(error)}`,
       Subject: 'Failed to increase EBS volume',
       TopicArn: snsTopicARN
      }).promise();
          
      await slackClient.chat.postMessage(
       { 
        channel: slackChannel,
        thread_ts: thread, 
        text: `Increase FAILED :no_entry: Check CloudWatch Logs for more details.`  
       }
    );
   }
  } 
 }

  const response = {
    statusCode: 200,
    body: JSON.stringify('OK'),
  };
  return response;
};