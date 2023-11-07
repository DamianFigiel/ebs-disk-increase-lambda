/**
 * Extract value from Grafana string based on key.
 * @param {string} key - Key to extract value for.
 * @param {string} fullString - Full string to extract value from.
 * @returns {string} - Extracted value.
 */
function extractValue(key, fullString) {
    let regex = new RegExp(`${key}=.+(,|\})`, "g");
    let match = fullString.match(regex)[0];
  
    if(key === 'instance') {
      return match.substring(match.indexOf('=')+1, match.indexOf(':'));
    } else {
      return match.substring(match.indexOf('=')+1, match.indexOf(','));
    }  
  }
  
  /**
   * Wait for specified amount of time.
   * @param {number} ms - Time to wait in milliseconds. Default value is 1000.
   */
  function wait(ms = 1000) {
      return new Promise(resolve => {
          setTimeout(resolve, ms);
      });
  };
  
  /**
   * Get current disk usage.
   * @param {object} ssm - AWS SSM instance. 
   * @param {string} instanceId - EC2 Instance ID.
   * @param {string} device - Device name (eg. '/dev/sdf').
   * @param {number} timeout - Timeout in milliseconds. Default value is 10000.
   * @returns 
   */
  async function getCurrentDiskUsage(ssm, instanceId, device, timeout = 10000) {
    let commandOutput, commandStatus;
   
    const { Command: { CommandId:commandId }} = await ssm.sendCommand(
    {
     DocumentName: 'AWS-RunShellScript', 
     InstanceIds: [instanceId],
     Parameters: {
       'commands': [`df --output=pcent -h ${device} | tail -n 1`]
    }}).promise();
    
    await wait();
    
    let now = new Date().getTime();
    while(commandStatus != 'Success' && (new Date().getTime() - now) < timeout) {
     ({ StandardOutputContent:commandOutput, Status: commandStatus } = await ssm.getCommandInvocation(
     {
       CommandId: commandId,
       InstanceId: instanceId, 
     }).promise());
     
     await wait(2000);
    }
    
    return Number(commandOutput.match(/\d+/)[0]);
  }
  
  /**
   * Resize filesystem of given device on given instance.
   * @param {object} ssm - AWS SSM instance. 
   * @param {string} instanceId - EC2 Instance ID. 
   * @param {string} device - Device name (eg. '/dev/sdf').
   * @param {number} timeout - Timeout in milliseconds. Default value is 10000.
   */
  async function resizeFileSystem(ssm, instanceId, device, timeout = 10000) {
    let commandStatus;
   
    const { Command: { CommandId:commandId }} = await ssm.sendCommand(
    {
     DocumentName: 'AWS-RunShellScript', 
     InstanceIds: [instanceId],
     Parameters: {
       'commands': [`sudo resize2fs ${device}`]
    }}).promise();
    
    await wait();
    
    let now = new Date().getTime();
    while(commandStatus != 'Success' && (new Date().getTime() - now) < timeout) {
     ({ Status: commandStatus } = await ssm.getCommandInvocation(
     {
       CommandId: commandId,
       InstanceId: instanceId, 
     }).promise());
     
     await wait(2000);
    }
  }

  module.exports = { extractValue, wait, getCurrentDiskUsage, resizeFileSystem };