import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import {WorkshopAppStage} from './stage-app';
import {CodeBuildStep, CodePipeline, CodePipelineSource, ShellStep} from "aws-cdk-lib/pipelines";
import * as iam from "aws-cdk-lib/aws-iam";
import path = require('path');
export class AWSKMSWorkshopPipeline extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
      super(scope, id, props);

      // Repository
      const repository = new codecommit.Repository(this, 'KMSWorkshopRepository', {
        repositoryName: "KMSWorkshopRepository",
//        code: codecommit.Code.fromDirectory(path.join(__dirname, '../') , 'main'), // optional property, branch parameter can be omitted
      });

      // CDK Pipeline
      let pipeline = new CodePipeline(this, "Pipeline", {
        pipelineName: `Pipeline-${this.stackName}`,
        selfMutation: false,
        publishAssetsInParallel: false,
        synth: new ShellStep("Synth", {
          input: CodePipelineSource.codeCommit(repository, "main"),
          commands: ["npm install", "npm run build", "npx cdk synth"],
        }),
        codeBuildDefaults: {
          rolePolicy: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["s3:*"],
              resources: ["*"],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["cloudfront:*"],
              resources: ["*"],
            }),
          ],
        },
      });
  
      
      const appStage = new WorkshopAppStage(this, 'App');
      pipeline.addStage(appStage, {
        post: [
          new ShellStep("DeployFrontEnd", {
            envFromCfnOutputs: {
              REACT_APP_PUBLIC_CLOUDFRONT_URL: appStage.cfnOutCloudFrontUrl,
              REACT_APP_PUBLIC_API_URL: appStage.cfnOutApiUrl,
              BUCKET_NAME: appStage.cfnOutBucketName,
              DISTRIBUTION_ID: appStage.cfnOutDistributionId,
            },
            commands: [
              "cd site-contents",
              "echo REACT_APP_API_KEY=$REACT_APP_API_KEY > .env",
              "npm install",
              "npm run build",
              "aws s3 cp ./build s3://$BUCKET_NAME --recursive",
              `aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"`,
            ],
          }),
        ],
      });
      new cdk.CfnOutput(this, "RepositoryCloneUrlHttp", {
        value: repository.repositoryCloneUrlGrc,
        description: "Code Repository Clone Url Http",
      });
    }
}