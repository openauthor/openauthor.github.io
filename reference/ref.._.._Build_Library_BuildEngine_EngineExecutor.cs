//-----------------------------------------------------------------------
// <copyright file="EngineExecutor.cs" company="Microsoft">
//     Copyright (c) Microsoft. All rights reserved.
// </copyright>
//-----------------------------------------------------------------------

namespace Microsoft.Content.Build.BuildEngine
{
    using System;
    using System.Collections.Generic;
    using System.Diagnostics;
    using System.IO;
    using System.Linq;
    using System.Runtime;
    using System.Threading.Tasks;
    using System.Xml;

    using Microsoft.Content.Build.Components;
    using Microsoft.Content.Build.DataAccessor.Interface;
    using Microsoft.Content.Build.DataContracts;
    using Microsoft.Content.Build.LogUtility;

    public sealed class EngineExecutor
    {
        private static readonly IEntityAccessor EntityAccessor = AccessorFactoryHelper.SharedEntityAccessor;

        /// <summary>
        /// Gets the singleton content builder
        /// </summary>
        public static readonly EngineExecutor Instance = new EngineExecutor();

        private EngineExecutor()
        {
            try
            {
                // environment variable to be used in the pipeline transform component
                Environment.SetEnvironmentVariable(Constants.BuildSetupFilePath, CommonServiceConfiguration.BuildSetupFilesUrl);
                Environment.SetEnvironmentVariable(Constants.ExecutableDir, CommonServiceConfiguration.ExecutableDir);
            }
            catch (Exception e)
            {
                TraceEx.TraceError(LogMessage.FormatMessage(LogCode.EngineExecutorInitError, e.Message));
                throw;
            }
        }

        /// <summary>
        /// build content based on message
        /// </summary>
        /// <param name="message">message</param>
        /// <param name="queueInfo">queue info, by default it is null</param>
        /// <returns>build content output</returns>
        public async Task<BuildContentOutput> BuildContentForMessageAsync(Message message, QueueInfo queueInfo = null)
        {
            if (message == null)
            {
                throw new ArgumentNullException("message");
            }

            using (message.GetCurrentAmbientContext())
            {
                return await DoBuildContentForMessageAsync(message, queueInfo);
            }
        }

        /// <summary>
        /// build content based on the request
        /// TODO: remove this public method as it is only used in unittest
        /// </summary>
        /// <param name="buildRequest">content build request</param>
        /// <returns>build content output</returns>
        public async Task<BuildContentOutput> BuildContentAsync(BuildRequest buildRequest)
        {
            if (buildRequest == null)
            {
                throw new ArgumentNullException("buildRequest");
            }

            Message message = buildRequest.SharedObject.GetValue<Message>(Constants.BuildMessage);

            using (message.GetCurrentAmbientContext())
            {
                return await DoBuildContentForBuildRequestAsync(buildRequest);
            }
        }

        private async Task<BuildContentOutput> DoBuildContentForMessageAsync(Message message, QueueInfo queueInfo)
        {
            ParamCollection contextParams = message.CustomData != null ? new ParamCollection(message.CustomData) : new ParamCollection();
            contextParams[Constants.EntityIdentifier] = message.EntityIdentifiers[0].ToString();

            BuildRequest buildRequest = new BuildRequest
            {
                ActionName = message.ActionName,
                SharedObject = new Dictionary<string, object> { { Constants.BuildMessage, message } },
                EntityIdentifier = message.EntityIdentifiers[0],
                ContextParams = contextParams,
                TrackingId = message.TrackingId.ToString(),
                IsIncremental = message.IsIncremental,
                QueueInfo = queueInfo,
            };

            string apiName = "Pipeline." + BuildActionMapper.GetPipelineName(buildRequest.ActionName);

            Dictionary<string, object> requestAbstraction = new Dictionary<string, object>
                                                                {
                                                                    { "buildRequest", buildRequest.ToString() } 
                                                                };

            using (var scope = new BackendBuildApiTraceScope(apiName, BuildApiCategory.BuildBackend, requestAbstraction))
            {
                return await scope.Run(
                    DoBuildContentForBuildRequestAsync(buildRequest),
                    Utility.ToJsonString,
                    GetBuildContentStatusCode);
            }
        }

        private async Task<BuildContentOutput> DoBuildContentForBuildRequestAsync(BuildRequest buildRequest)
        {
            Message message = buildRequest.SharedObject.GetValue<Message>(Constants.BuildMessage);

            // add message priority into AmbientContext
            SetMessagePriorityInAmbientContext(message);

            TraceEx.TraceInformation(
                string.Format(
                    "Build content for request Action: {0}, EntityIdentifier: {1}, Message: {2}",
                    buildRequest.ActionName,
                    buildRequest.EntityIdentifier,
                    Utility.ToJsonString(message)));

            string pipelineName = BuildActionMapper.GetPipelineName(buildRequest.ActionName);
            if (string.IsNullOrEmpty(pipelineName))
            {
                string errorMessage = LogMessage.FormatMessage(LogCode.PipelineForActionNotFound, buildRequest.ActionName);
                TraceEx.TraceError(errorMessage);
                throw new ArgumentException(errorMessage);
            }

            BuildEngine engine;
            BuildContext context;
            using (new PerformanceScopeWrapper(
                "Setup Context",
                PerformanceCategory.Pipeline))
            {
                string reportPipelineName = GetReportPipelineName(buildRequest.ActionName, message.MessageType);
                engine = BuildEngineFactory.CreateEngineByPipelineName(reportPipelineName);
                context = engine.Context;

                context.XmlContext.AddVariable(Constants.ContextData.PipelineName, pipelineName);
                await SetupContextAsync(context, buildRequest);
                context.SetSharedObject(Constants.ContextData.PipelineStartTime, DateTime.UtcNow);
            }

            PipelineResult result = PipelineResult.Break;

            using (new PerformanceScopeWrapper(
                string.Format("Setup Pipeline: {0}", buildRequest.ActionName),
                PerformanceCategory.Pipeline))
            {
                engine.Pipeline.Setup(context);
            }

            XmlDocument document = new XmlDocument();

            result = await engine.Pipeline.ApplyAsync(document, context);

            return new BuildContentOutput
            {
                BuildContentResult = result == PipelineResult.NeedRerun ? BuildContentResult.NeedRerun : BuildContentResult.Succeeded,
                Outputs = context.Outputs
            };
        }

        private static string GetReportPipelineName(string actionName, MessageType messageType)
        {
            string reportPipelineName = BuildActionMapper.GetReportPipelineName(actionName);
            if (reportPipelineName == null)
            {
                switch (messageType)
                {
                    case MessageType.Ordinary:
                        reportPipelineName = "Report_OrdinaryMessage";
                        break;

                    case MessageType.Workflow:
                        reportPipelineName = "Report_WorkflowMessage";
                        break;

                    case MessageType.SubMessage:
                        reportPipelineName = "Report_SubMessage";
                        break;

                    default:
                        throw new NotSupportedException(string.Format("Unrecognized message type: {0}", messageType));
                }
            }

            return reportPipelineName;
        }

        private static async Task SetupContextAsync(BuildContext context, BuildRequest buildRequest)
        {
            // Setup XmlContext
            context.XmlContext.AddVariable(Constants.ContextData.IncrementalBuild, buildRequest.IsIncremental);

            if (buildRequest.ContextParams == null || buildRequest.ContextParams.Count == 0)
            {
                TraceEx.TraceWarning(LogMessage.FormatMessage(LogCode.PipelineStartsWithoutContextParameter, BuildActionMapper.GetPipelineName(buildRequest.ActionName)));
            }
            else
            {
                foreach (var contextParam in buildRequest.ContextParams.Where(kvp => !string.IsNullOrEmpty(kvp.Key)))
                {
                    context.XmlContext.AddVariable(contextParam.Key, contextParam.Value ?? string.Empty);
                }
            }

            // TODO: refactor this into a separate component
            if (buildRequest.EntityIdentifier != null)
            {
                context.XmlContext.AddVariable(Constants.EntityIdentifier, buildRequest.EntityIdentifier.ToString());
            }

            if (EnvironmentConfiguration.Environment.Value != null)
            {
                context.XmlContext.AddVariable(
                    Constants.Service.ContentService,
                    EnvironmentConfiguration.Environment.Value.GetValue<string>(Constants.Service.ContentServiceEndpoint).TrimEnd('/'));
            }

            if (CommonServiceConfiguration.PreviewContainerUrl.Value != null)
            {
                context.XmlContext.AddVariable(
                    Constants.PreviewContainerUrl,
                    CommonServiceConfiguration.PreviewContainerUrl.Value.TrimEnd('/'));
            }

            if (CommonServiceConfiguration.CollectionContainerUrl.Value != null)
            {
                context.XmlContext.AddVariable(
                    Constants.CollectionContainerUrl,
                    CommonServiceConfiguration.CollectionContainerUrl.Value.TrimEnd('/'));
            }

            // apply build config
            var buildConfigName = BuildActionMapper.GetBuildConfig(buildRequest.ActionName);
            if (buildRequest.EntityIdentifier != null && buildConfigName != null)
            {
                var organizationId = await context.GetOrganizationIdFromProjectAsync(buildRequest.EntityIdentifier.ProjectId);

                var buildConfig = await EntityAccessor.GetBuildConfigAsync(organizationId, buildConfigName);

                if (buildConfig != null)
                {
                    foreach (var config in buildConfig)
                    {
                        context.XmlContext.AddVariable(config.Key, config.Value);
                    }
                }
            }

            // Setup SharedObject
            if (buildRequest.SharedObject != null)
            {
                foreach (var sharedObject in buildRequest.SharedObject.Where(kvp => !string.IsNullOrEmpty(kvp.Key)))
                {
                    context.SetSharedObject(sharedObject.Key, sharedObject.Value);
                }
            }

            if (buildRequest.QueueInfo != null)
            {
                context.QueueInfo = buildRequest.QueueInfo;
            }
        }

        private static void SetMessagePriorityInAmbientContext(Message message)
        {
            AmbientContext context = AmbientContext.TryGetCurrentContext();
            if (context != null)
            {
                context[Constants.AmbientContextIndexes.BuildMessagePriority] = message.Priority;
            }
        }

        private static ApiStatusCode GetBuildContentStatusCode(BuildContentOutput output)
        {
            object isIncremental;
            if (output != null &&
                output.Outputs != null &&
                output.Outputs.TryGetValue(MetadataName.BuildJob.IsIncremental, out isIncremental) &&
                isIncremental != null)
            {
                // if output contains incremental information, return NoChange when is_incremental is true
                if ((bool)isIncremental)
                {
                    return ApiStatusCode.NoChange;
                }
            }

            return ApiStatusCode.Succeed;
        }
    }
}
