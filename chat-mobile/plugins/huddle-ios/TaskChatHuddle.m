#import <React/RCTEventEmitter.h>
#import <React/RCTBridgeModule.h>

@interface TaskChatHuddle : RCTEventEmitter <RCTBridgeModule>
@property(nonatomic,strong) NSTimer *heartbeat;
@property(nonatomic,assign) BOOL listening;
@property(nonatomic,assign) BOOL broadcasting;
@end

static void broadcastEvent(CFNotificationCenterRef center,void *observer,CFStringRef name,const void *object,CFDictionaryRef info) {
  TaskChatHuddle *module=(__bridge TaskChatHuddle *)observer;
  BOOL started=[(__bridge NSString *)name hasSuffix:@".started"];
  dispatch_async(dispatch_get_main_queue(),^{module.broadcasting=started;if(module.listening)[module sendEventWithName:@"taskchat:huddle-broadcast" body:@{@"started":@(started)}];});
}
@implementation TaskChatHuddle
RCT_EXPORT_MODULE()
+ (BOOL)requiresMainQueueSetup {return YES;}
- (dispatch_queue_t)methodQueue {return dispatch_get_main_queue();}
- (instancetype)init {
  if((self=[super init])){
    NSString *group=[[NSBundle mainBundle] objectForInfoDictionaryKey:@"RTCAppGroupIdentifier"];
    if(group)for(NSString *event in @[@"started",@"ended"]){NSString *name=[NSString stringWithFormat:@"%@.huddle.%@",group,event];CFNotificationCenterAddObserver(CFNotificationCenterGetDarwinNotifyCenter(),(__bridge void *)self,broadcastEvent,(__bridge CFStringRef)name,NULL,CFNotificationSuspensionBehaviorDeliverImmediately);}
  }return self;
}
- (NSArray<NSString *> *)supportedEvents {return @[@"taskchat:huddle-heartbeat",@"taskchat:huddle-broadcast"];}
- (void)startObserving {self.listening=YES;}
- (void)stopObserving {self.listening=NO;}
RCT_EXPORT_METHOD(start:(BOOL)microphone resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [self.heartbeat invalidate];
  __weak TaskChatHuddle *weakSelf=self;
  self.heartbeat=[NSTimer scheduledTimerWithTimeInterval:20 repeats:YES block:^(NSTimer *timer){TaskChatHuddle *strongSelf=weakSelf;if(strongSelf.listening)[strongSelf sendEventWithName:@"taskchat:huddle-heartbeat" body:nil];}];
  resolve(nil);
}
RCT_EXPORT_METHOD(stopBroadcast) {
  NSString *group=[[NSBundle mainBundle] objectForInfoDictionaryKey:@"RTCAppGroupIdentifier"];
  if(group){NSString *name=[group stringByAppendingString:@".huddle.stop"];CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(),(__bridge CFStringRef)name,NULL,NULL,true);}
}
RCT_EXPORT_METHOD(stop) {[self.heartbeat invalidate];self.heartbeat=nil;[self stopBroadcast];}
- (void)invalidate {[self stop];CFNotificationCenterRemoveEveryObserver(CFNotificationCenterGetDarwinNotifyCenter(),(__bridge void *)self);[super invalidate];}
@end
