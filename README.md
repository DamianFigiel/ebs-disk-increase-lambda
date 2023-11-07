# EBS Volume increase and filesystem resize with Lambda

Lambda function in node v16 that increases EBS Volume and resize filesystem.
Slack integration included. SNS notification in case of failure.

Usage scenario:

1. Grafana alarm triggers for e.g. 90% of disk usage.
2. Contact point for this alarm is a WebSocket that points to AWS API Gateway.
3. API Gateway authenticates request with Lambda Authorizer.
4. API Gateway triggers Lambda function.
5. EC2 instance and EBS Volumeis are identified based on request payload.
6. Actual % usage of a disk is checked.
7. EBS Volume is increased by specified value.
8. Lambda waits for EBS Volume to not be in 'modifing' state.
9. Filesystem is resized.
10. New % usage of a disk is checked.

