exports.handler = async (event, context, callback) => {
    const token = event.authorizationToken;

    if(token === `Bearer ${process.env.TOKEN_VALUE}`) {
        callback(null, generatePolicy('user', 'Allow', event.methodArn));       
    } else {
        callback("Unauthorized");     
    }
};

// Help function to generate an IAM policy
var generatePolicy = function(principalId, effect, resource) {
    var authResponse = {};
    
    authResponse.principalId = principalId;
    if (effect && resource) {
        var policyDocument = {};
        policyDocument.Version = '2012-10-17'; 
        policyDocument.Statement = [];
        var statementOne = {};
        statementOne.Action = 'execute-api:Invoke'; 
        statementOne.Effect = effect;
        statementOne.Resource = resource;
        policyDocument.Statement[0] = statementOne;
        authResponse.policyDocument = policyDocument;
    }
    
    return authResponse;
}
