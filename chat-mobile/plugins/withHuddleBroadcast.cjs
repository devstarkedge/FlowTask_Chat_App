const {withInfoPlist,withEntitlementsPlist,withXcodeProject,withDangerousMod,createRunOncePlugin}=require('expo/config-plugins');
const fs=require('node:fs');
const path=require('node:path');
const plist=require('@expo/plist');
const targetName='TaskChatBroadcast';

function configureProject(project,config){
  const bundleId=config.ios.bundleIdentifier+'.HuddleBroadcast';
  const targets=project.pbxNativeTargetSection();
  const existing=Object.entries(targets).find(([key,value])=>!key.endsWith('_comment') && String(value.name).replaceAll('"','')===targetName);
  const main=project.getFirstTarget().uuid;
  const target=existing?{uuid:existing[0],pbxNativeTarget:existing[1]}:project.addTarget(targetName,'app_extension',targetName,bundleId);
  if(!existing){
  project.addBuildPhase([targetName+'/SampleHandler.swift'],'PBXSourcesBuildPhase','Sources',target.uuid);
  const group=project.addPbxGroup([targetName+'/SampleHandler.swift'],targetName);
  project.addToPbxGroup(group.uuid,project.getFirstProject().firstProject.mainGroup);
  project.addBuildPhase([],'PBXFrameworksBuildPhase','Frameworks',target.uuid);
  for(const framework of ['ReplayKit.framework','CoreImage.framework','CoreMedia.framework','ImageIO.framework'])project.addFramework(framework,{target:target.uuid,link:true});
  project.addSourceFile('TaskChatHuddle.m',{target:main},project.getFirstProject().firstProject.mainGroup);
  }
  for(const reference of Object.values(project.pbxFileReferenceSection())){
    if(reference && typeof reference==='object')for(const key of Object.keys(reference))if(reference[key]===undefined)delete reference[key];
  }
  const objects=project.hash.project.objects;
  const list=objects.XCConfigurationList[target.pbxNativeTarget.buildConfigurationList];
  const mainList=objects.XCConfigurationList[targets[main].buildConfigurationList];
  for(const entry of list.buildConfigurations){
    const settings=objects.XCBuildConfiguration[entry.value].buildSettings;
    const mainEntry=mainList.buildConfigurations.find(item=>item.comment===entry.comment) || mainList.buildConfigurations[0];
    const parent=objects.XCBuildConfiguration[mainEntry.value].buildSettings;
    Object.assign(settings,{INFOPLIST_FILE:`${targetName}/${targetName}-Info.plist`,CODE_SIGN_ENTITLEMENTS:`${targetName}/${targetName}.entitlements`,
      PRODUCT_BUNDLE_IDENTIFIER:bundleId,SWIFT_VERSION:'5.0',CLANG_ENABLE_MODULES:'YES',APPLICATION_EXTENSION_API_ONLY:'YES',
      IPHONEOS_DEPLOYMENT_TARGET:parent.IPHONEOS_DEPLOYMENT_TARGET || '15.1',TARGETED_DEVICE_FAMILY:'"1,2"',CODE_SIGN_STYLE:'Automatic',
      CURRENT_PROJECT_VERSION:config.ios.buildNumber || parent.CURRENT_PROJECT_VERSION || '1',MARKETING_VERSION:config.version || parent.MARKETING_VERSION || '1.0.0'});
    if(parent.DEVELOPMENT_TEAM || config.ios.appleTeamId)settings.DEVELOPMENT_TEAM=parent.DEVELOPMENT_TEAM || config.ios.appleTeamId;
  }
  return project;
}
function withHuddleBroadcast(config){
  const group=`group.${config.ios.bundleIdentifier}.huddle`,bundleIdentifier=config.ios.bundleIdentifier+'.HuddleBroadcast';
  config.extra=config.extra || {};config.extra.eas=config.extra.eas || {};config.extra.eas.build=config.extra.eas.build || {};
  const build=config.extra.eas.build;build.experimental=build.experimental || {};build.experimental.ios=build.experimental.ios || {};
  const extensions=build.experimental.ios.appExtensions || [];
  build.experimental.ios.appExtensions=[...extensions.filter(item=>item.targetName!==targetName),{targetName,bundleIdentifier,entitlements:{'com.apple.security.application-groups':[group]}}];
  config=withInfoPlist(config,mod=>{mod.modResults.RTCAppGroupIdentifier=group;mod.modResults.RTCScreenSharingExtension=bundleIdentifier;return mod;});
  config=withEntitlementsPlist(config,mod=>{mod.modResults['com.apple.security.application-groups']=[...new Set([...(mod.modResults['com.apple.security.application-groups'] || []),group])];return mod;});
  config=withDangerousMod(config,['ios',async mod=>{
    const root=mod.modRequest.platformProjectRoot,directory=path.join(root,targetName);fs.mkdirSync(directory,{recursive:true});
    fs.copyFileSync(path.join(__dirname,'huddle-ios/SampleHandler.swift'),path.join(directory,'SampleHandler.swift'));
    fs.copyFileSync(path.join(__dirname,'huddle-ios/TaskChatHuddle.m'),path.join(root,'TaskChatHuddle.m'));
    fs.writeFileSync(path.join(directory,targetName+'-Info.plist'),plist.default.build({CFBundleDisplayName:'TaskChat Screen Share',CFBundleExecutable:'$(EXECUTABLE_NAME)',CFBundleIdentifier:'$(PRODUCT_BUNDLE_IDENTIFIER)',CFBundleName:'$(PRODUCT_NAME)',CFBundlePackageType:'XPC!',CFBundleShortVersionString:'$(MARKETING_VERSION)',CFBundleVersion:'$(CURRENT_PROJECT_VERSION)',RTCAppGroupIdentifier:group,
      NSExtension:{NSExtensionPointIdentifier:'com.apple.broadcast-services-upload',NSExtensionPrincipalClass:'$(PRODUCT_MODULE_NAME).SampleHandler',NSExtensionAttributes:{RPBroadcastProcessMode:'RPBroadcastProcessModeSampleBuffer'}}}));
    fs.writeFileSync(path.join(directory,targetName+'.entitlements'),plist.default.build({'com.apple.security.application-groups':[group]}));
    return mod;
  }]);
  return withXcodeProject(config,mod=>{configureProject(mod.modResults,mod);return mod;});
}
module.exports=createRunOncePlugin(withHuddleBroadcast,'taskchat-huddle-broadcast','1.0.0');
module.exports.configureProject=configureProject;
