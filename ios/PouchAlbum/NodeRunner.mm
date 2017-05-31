//
//  NodeRunner.mm
//  PouchAlbum
//
//  Created by Jaime Bernardo on 17/05/2017.
//  Copyright © 2017 Janea Systems. All rights reserved.
//

#include "NodeRunner.hpp"
#include <nodeLib/node.hpp>
#include <string>

@implementation NodeRunner

NSFileHandle *pipeControlWriteHandle;
NSFileHandle *pipeControlReadHandle;
NSPipe *controlPipe;

+ (void) CreateControlPipe
{
  controlPipe = [NSPipe pipe] ;
  pipeControlReadHandle = [controlPipe fileHandleForReading];
  pipeControlWriteHandle = [controlPipe fileHandleForWriting];
}

//node's libUV requires all arguments being on contiguous memory.
+ (void) startEngineWithArguments:(NSArray*)arguments
{
  int c_arguments_size=0;
  
  //Compute byte size need for all arguments in contiguous memory.
  for (id argElement in arguments)
  {
    c_arguments_size+=strlen([argElement UTF8String]);
    c_arguments_size++; // for '\0'
  }
  
  //Stores arguments in contiguous memory.
  char* args_buffer=(char*)calloc(c_arguments_size, sizeof(char));
  
  //argv to pass into node.
  char* argv[[arguments count]];
  
  //To iterate through the expected start position of each argument in args_buffer.
  char* current_args_position=args_buffer;
  
  //Argc
  int argument_count=0;
  
  //Populate the args_buffer and argv.
  for (id argElement in arguments)
  {
    const char* current_argument=[argElement UTF8String];
    
    //Copy current argument to its expected position in args_buffer
    strncpy(current_args_position, current_argument, strlen(current_argument));
    
    //Save current argument start position in argv and increment argc.
    argv[argument_count]=current_args_position;
    argument_count++;
    
    //Increment to the next argument's expected position.
    current_args_position+=strlen(current_args_position)+1;
  }
  
  //Start node, with argc and argv.
  node::Start(argument_count,argv);
}

+ (void) startEngine
{

  NSString* srcPath = [[NSBundle mainBundle] pathForResource:@"nodeproj" ofType:nil];
  
  NSString* tmpPath = NSTemporaryDirectory();
  
  //Get the new path for the main JS file.
  NSString* nodeMain = [srcPath stringByAppendingString:@"/main.js"];
  
  //Get the new path for the log file.
  NSString* pouchLog = [tmpPath stringByAppendingString:@"/log.txt"];
  
  // Get a file descriptor int to pass into node, as a way to inject control input.
  NSString* controlFileDescriptorNS = [NSString stringWithFormat:@"%d",[pipeControlReadHandle fileDescriptor]];
  
  //Construct a NSArray of NSString to use as node's arguments.
  NSArray* nodeArguments = [NSArray arrayWithObjects:
                            @"node",
                            nodeMain,
                            [NSString stringWithFormat:@"--pouchlog=%@",pouchLog],
                            [NSString stringWithFormat:@"--controlfh=%@",controlFileDescriptorNS],
                            nil
                            ];
  
  //Process the arguments and start node.
  [NodeRunner startEngineWithArguments:nodeArguments];
}

+(void) sendControlMessage:(NSString*)message
{
  [pipeControlWriteHandle writeData:[[NSString stringWithFormat: @"%@\n", message] dataUsingEncoding:NSUTF8StringEncoding]];
}

//Pre-initializes the NodeRunner parts and starts the node engine in another thread.
+ (void) spawnBackgroundEngineInstance
{
  [self CreateControlPipe];
  
  //Spawns the engine in a background thread.
  dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_BACKGROUND, 0), ^{
    [self startEngine];
  });

  /* To try and run nodeRunner within a thread with a bigger stack.
  NSThread* t = [[NSThread alloc] initWithTarget:[NodeRunner class]
                                        selector:@selector(startEngine)
                                          object:nil];
  [t setStackSize:4096*1024];
  [t start];
  */
}


@end
