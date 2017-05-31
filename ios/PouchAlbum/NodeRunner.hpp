//
//  NodeRunner.hpp
//  PouchAlbum
//
//  Created by Jaime Bernardo on 17/05/2017.
//  Copyright © 2017 Janea Systems. All rights reserved.
//

#ifndef NodeRunner_hpp
#define NodeRunner_hpp
#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@interface NodeRunner : NSObject
{}
+ (void) spawnBackgroundEngineInstance;
+ (void) sendControlMessage:(NSString*)message;
@end

#endif /* NodeRunner_hpp */
