const {withAndroidManifest,withMainApplication,withDangerousMod,AndroidConfig,createRunOncePlugin}=require('expo/config-plugins');
const fs=require('node:fs');
const path=require('node:path');

// App-owned Android call lifetime. The service runs only after an explicit
// join and is stopped on leave/logout; it never auto-starts at boot.
const service=`package com.taskchat.huddle;
import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;

public final class HuddleCallService extends Service {
  private final Handler handler=new Handler(Looper.getMainLooper());
  private PowerManager.WakeLock wakeLock;
  private final Runnable heartbeat=new Runnable(){public void run(){
    if(wakeLock!=null){if(wakeLock.isHeld())wakeLock.release();wakeLock.acquire(60000);}
    HuddleCallModule.pulse();handler.postDelayed(this,20000);
  }};
  @Override public void onCreate(){super.onCreate();
    PowerManager power=(PowerManager)getSystemService(POWER_SERVICE);
    wakeLock=power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"TaskChat:Huddle");
    wakeLock.setReferenceCounted(false);
  }
  @Override public int onStartCommand(Intent intent,int flags,int startId){
    if(!HuddleCallModule.desiredActive){stopSelf();return START_NOT_STICKY;}
    NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
    if(Build.VERSION.SDK_INT>=26){NotificationChannel channel=new NotificationChannel("huddle_active","Active Huddle",NotificationManager.IMPORTANCE_LOW);channel.setSound(null,null);manager.createNotificationChannel(channel);}
    Intent launch=getPackageManager().getLaunchIntentForPackage(getPackageName());
    PendingIntent open=launch==null?null:PendingIntent.getActivity(this,0,launch,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    Notification.Builder builder=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,"huddle_active"):new Notification.Builder(this);
    Notification notification=builder.setSmallIcon(getApplicationInfo().icon).setContentTitle("TaskChat Huddle")
      .setContentText("Call in progress · tap to return").setCategory(Notification.CATEGORY_CALL).setOngoing(true).setContentIntent(open).build();
    boolean microphone=intent!=null && intent.getBooleanExtra("microphone",false);
    if(Build.VERSION.SDK_INT>=29)startForeground(4701,notification,microphone && Build.VERSION.SDK_INT>=30?ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE:ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
    else startForeground(4701,notification);
    handler.removeCallbacks(heartbeat);handler.post(heartbeat);
    return START_NOT_STICKY;
  }
  @Override public void onDestroy(){handler.removeCallbacksAndMessages(null);if(wakeLock!=null && wakeLock.isHeld())wakeLock.release();stopForeground(true);super.onDestroy();}
  @Override public IBinder onBind(Intent intent){return null;}
}
`;
const moduleSource=`package com.taskchat.huddle;
import android.content.Intent;
import android.os.Build;
import com.facebook.react.bridge.*;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import java.lang.ref.WeakReference;

public final class HuddleCallModule extends ReactContextBaseJavaModule {
  static volatile boolean desiredActive=false;
  private static WeakReference<ReactApplicationContext> context=new WeakReference<>(null);
  public HuddleCallModule(ReactApplicationContext react){super(react);context=new WeakReference<>(react);}
  @Override public String getName(){return "TaskChatHuddle";}
  @ReactMethod public void start(boolean microphone,Promise promise){
    try{desiredActive=true;Intent intent=new Intent(getReactApplicationContext(),HuddleCallService.class).putExtra("microphone",microphone);
      if(Build.VERSION.SDK_INT>=26)getReactApplicationContext().startForegroundService(intent);else getReactApplicationContext().startService(intent);
      promise.resolve(null);
    }catch(Exception error){desiredActive=false;promise.reject("HUDDLE_BACKGROUND_UNAVAILABLE","Could not keep this Huddle active in the background.",error);}
  }
  @ReactMethod public void stop(){desiredActive=false;getReactApplicationContext().stopService(new Intent(getReactApplicationContext(),HuddleCallService.class));}
  @ReactMethod public void addListener(String eventName){}
  @ReactMethod public void removeListeners(double count){}
  @Override public void invalidate(){stop();super.invalidate();}
  static void pulse(){ReactApplicationContext react=context.get();if(react!=null && react.hasActiveReactInstance())react.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit("taskchat:huddle-heartbeat",null);}
}
`;
const packageSource=`package com.taskchat.huddle;
import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.*;
import com.facebook.react.uimanager.ViewManager;
import java.util.*;
public final class HuddleCallPackage implements ReactPackage {
  public List<NativeModule> createNativeModules(ReactApplicationContext react){return Collections.<NativeModule>singletonList(new HuddleCallModule(react));}
  public List<ViewManager> createViewManagers(ReactApplicationContext react){return Collections.emptyList();}
}
`;

function registerPackage(contents,language){
  if(contents.includes('com.taskchat.huddle.HuddleCallPackage'))return contents;
  if(language==='kt' && contents.includes('PackageList(this).packages.apply {'))return contents.replace('PackageList(this).packages.apply {','PackageList(this).packages.apply {\n              add(com.taskchat.huddle.HuddleCallPackage())');
  const java=/((?:List<ReactPackage>|var) packages = new PackageList\(this\).getPackages\(\);)/;
  if(language==='java' && java.test(contents))return contents.replace(java,'$1\n        packages.add(new com.taskchat.huddle.HuddleCallPackage());');
  throw new Error('Could not register TaskChat Huddle lifetime service in MainApplication.');
}
function withHuddleCalling(config){
  config=AndroidConfig.Permissions.withPermissions(config,['android.permission.FOREGROUND_SERVICE','android.permission.FOREGROUND_SERVICE_MICROPHONE','android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK','android.permission.WAKE_LOCK']);
  config=withAndroidManifest(config,mod=>{
    const app=AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    app.service=app.service || [];
    if(!app.service.some(item=>item.$['android:name']==='com.taskchat.huddle.HuddleCallService'))app.service.push({$:{'android:name':'com.taskchat.huddle.HuddleCallService','android:exported':'false','android:stopWithTask':'false','android:foregroundServiceType':'microphone|mediaPlayback'}});
    return mod;
  });
  config=withMainApplication(config,mod=>{mod.modResults.contents=registerPackage(mod.modResults.contents,mod.modResults.language);return mod;});
  return withDangerousMod(config,['android',async mod=>{
    const directory=path.join(mod.modRequest.platformProjectRoot,'app/src/main/java/com/taskchat/huddle');fs.mkdirSync(directory,{recursive:true});
    for(const [name,contents] of Object.entries({'HuddleCallService.java':service,'HuddleCallModule.java':moduleSource,'HuddleCallPackage.java':packageSource}))fs.writeFileSync(path.join(directory,name),contents);
    return mod;
  }]);
}
module.exports=createRunOncePlugin(withHuddleCalling,'taskchat-huddle-calling','1.0.0');
module.exports.registerPackage=registerPackage;
