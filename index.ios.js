import React, { Component } from 'react';
import {
  AppRegistry,
  StyleSheet,
  Text,
  View,
  Linking,
  TouchableOpacity,
  Button,
  TextInput,
  Keyboard,
  FlatList,
  ScrollView,
  KeyboardAvoidingView,
  ImagePickerIOS,
  Image,
  ImageStore,
  TouchableHighlight,
} from 'react-native';

import {
  StackNavigator,
} from 'react-navigation';

import Prompt from 'react-native-prompt';

import RestClient from 'react-native-rest-client';

import RNFetchBlob from 'react-native-fetch-blob';

import ProgressBar from 'react-native-progress/Bar';

import UUID from 'react-native-uuid';

class PouchAlbumAPI extends RestClient {
  constructor (host, port, dbname) {
    super(`http://${host.toString()}:${port.toString()}`);
    this.host = host;
    this.port = port;
    this.dbname = dbname;
  }

  getDbInfo() {
    return this.GET(`/${this.dbname.toString()}`);
  }

  createImageAttachmentURL(pouchDoc) {
    //Given a PouchDB document, return a URI to show its image attachment.
    return `http://${this.host}:${this.port}/${this.dbname}/${encodeURIComponent(pouchDoc.doc._id)}/image.jpg`;
  }

  createAlbumOpenPhoto(albumName,nickname,photoTimeStamp)
  {
    photoTimeStamp = photoTimeStamp.toISOString();
    var photoDoc = {
      type: 'photo',
      albumName:albumName,
      photoTimeStamp:photoTimeStamp,
      nickname:nickname,
      show:0,
      message:'album creation'
    };
    photoDoc._id = photoDoc.type+'/'+photoDoc.albumName+'/'+photoDoc.photoTimeStamp+'/'+nickname;
    var docIdEncoded = encodeURIComponent(photoDoc._id);
    this.PUT(`/${this.dbname.toString()}/${docIdEncoded}`,photoDoc)
    .then(() => {})
    .catch(() => {});
  }

  createPhoto(albumName,nickname,photoTimeStamp,msg,attachmentURI)
  {
    photoTimeStamp = photoTimeStamp.toISOString();
    var photoDoc = {
      type: 'photo',
      albumName:albumName,
      photoTimeStamp:photoTimeStamp,
      nickname:nickname,
      show:1,
      message:msg
    };
    photoDoc._id = photoDoc.type+'/'+photoDoc.albumName+'/'+photoDoc.photoTimeStamp+'/'+nickname;

    var docIdEncoded = encodeURIComponent(photoDoc._id);

    if (attachmentURI)
    {
      //the way to get the base64 data depends on the source.
      var correctFileReadPromise;
      if (attachmentURI.startsWith("rct-image-store:")) {
        correctFileReadPromise = new Promise((resolve,reject) => {
          //Method for camera photo.
          ImageStore.getBase64ForTag(attachmentURI,
            (data) => {resolve(data);},
            (err) => {reject(err);}
          );
        });
      } else {
        //Method for camera roll.
        correctFileReadPromise = RNFetchBlob.fs.readFile(attachmentURI, 'base64');
      }

      return correctFileReadPromise.then((data) => {
          photoDoc._attachments = {
            'image.jpg': {
              content_type: 'image/jpeg',
              data: data,
            }
          };
          return this.PUT(`/${this.dbname.toString()}/${docIdEncoded}`,photoDoc);
        });
    } else {
      return this.PUT(`/${this.dbname.toString()}/${docIdEncoded}`,photoDoc);
    }

  }

  listAlbumPhotos(albumName)
  {
    var startquery = 'photo/'+albumName+'/';
    var endquery = startquery+'\uFFFF';
    startquery = encodeURIComponent(startquery);
    endquery = encodeURIComponent(endquery);
    return this.GET(`/${this.dbname.toString()}/_all_docs?include_docs=true&startkey=${startquery}&endkey=${endquery}`);
  }
  listAlbums()
  {
    return this.GET(`/${this.dbname.toString()}/_design/list_albums/_view/by_name?group=true`);
  }
};

const localAlbumDB = new PouchAlbumAPI('localhost',3000,'album');

class GetVersionsAPI extends RestClient {
  constructor (host, port) {
    super(`http://${host.toString()}:${port.toString()}`);
    this.host = host;
    this.port = port;
  }
  getVersions() {
    return this.GET('/');
  }
};

const getVersionsClient = new GetVersionsAPI('localhost',3001);

class AlbumView extends Component {
  constructor(props){
    super(props);
    this._isMounted = false;
    this.scrollHeight = 0;
    this.messageText = '';
    this.runningInBG = false;
    this.state = {messageList:[]};
    this.changeSubWS = null;
    this.cacheForceUpdate = false;
  }
  refreshMessages(forceUpdate = false) {
    if ((this.runningInBG)) {
      if (this.forceUpdate) {
        this.cacheForceUpdate=true;
      }
      return;
    }
    this.runningInBG = true;
    this.cacheForceUpdate = false;
    localAlbumDB.listAlbumPhotos(this.props.currentAlbum)
    .then(response => {if (this._isMounted) {
      this.setState({messageList: response.rows })
    }})
    .catch(err => {})
    .then(() => {if (this._isMounted) {
      this.runningInBG = false;
      if (this.cacheForceUpdate) {
        this.refreshMessages();
      }
    }})
  }

  createChangeSubscriberWS = () => {
    var ws = new WebSocket('ws://localhost:3001/');
    ws.onmessage = (e) => {
      this.refreshMessages(forceUpdate=true);
    }
    ws.onclose = (e) => {
      if (this._isMounted) {
        this.changeSubWS=this.createChangeSubscriberWS();
      }
    }
    return ws;
  }

  componentWillMount() {
    this._isMounted = true;
    this.refreshTimerInterval=setInterval(() => {
      this.refreshMessages();
    }, 10000);
    this.changeSubWS = this.createChangeSubscriberWS();
    this.refreshMessages();
  }
  componentWillUnmount() {
    this._isMounted = false;
    if (this.changeSubWS) {
      this.changeSubWS.close();
    }
    clearInterval(this.refreshTimerInterval);
  }
  render() {
    return (
      <View style = {{flex: 1}}>
        <ScrollView
          ref = {ref => this.scrollRef = ref}
          onContentSizeChange = {(contentWidth, contentHeight) => {
            this.scrollRef.scrollTo({
              y : Math.max(contentHeight-this.scrollHeight,0),
              animated : true
            })
          }}
          onLayout = {ev => this.scrollHeight=ev.nativeEvent.layout.height}
          >
          <View style = {{flex:1, flexDirection:'row', flexWrap:'wrap'}}
          >
            {
              this.state.messageList.map((item) => {
                return item.doc._attachments?
                  <View key = {item.key} style = {{width:'50%', aspectRatio:1}}>
                    <TouchableHighlight style = {{flex:1}}
                      onPress = {() => {this.props.onSelectPhoto(item);}}
                    >
                      <Image
                        style = {styles.photo_image_small}
                        source = {{uri:localAlbumDB.createImageAttachmentURL(item)}}
                      />
                    </TouchableHighlight>
                  </View>
                  :null
                ;
              })
            }
          </View>
        </ScrollView>
      </View>
    );
  }
}

class OpenURLButton extends React.Component {
  static propTypes = {
    url: React.PropTypes.string,
  };

  handleClick = () => {
    Linking.openURL(this.props.url);
  };

  render() {
    return (
      <TouchableOpacity
        onPress = {this.handleClick}>
        {this.props.children}
      </TouchableOpacity>
    );
  }
}

class ResizableButton extends React.Component {
//Adpated from React Native default button for iOS.
  props: {
    title: string,
    onPress: () => any,
    color?: ?string,
    accessibilityLabel?: ?string,
    disabled?: ?boolean,
    textSize?: ?number,
  };

  styles = StyleSheet.create({
    button: {},
    text: {
      color: '#0C42FD',
      textAlign: 'center',
      padding: 8,
      fontSize: 18,
    },
    buttonDisabled: {},
    textDisabled: {
      color: '#cdcdcd',
    },
  });

  render() {
    const {
      accessibilityLabel,
      color,
      onPress,
      title,
      disabled,
      textSize,
    } = this.props;
    const buttonStyles = [this.styles.button];
    const textStyles = [this.styles.text];
    const Touchable = TouchableOpacity;
    if (color) {
      textStyles.push({color: color});
    }
    if (disabled) {
      textStyles.push(this.styles.textDisabled);
    }
    if (textSize) {
      textStyles.push({fontSize: textSize});
    }
    const formattedTitle = title;
    const accessibilityTraits = ['button'];
    if (disabled) {
      accessibilityTraits.push('disabled');
    }
    return (
      <Touchable
        accessibilityComponentType = "button"
        accessibilityLabel = {accessibilityLabel}
        accessibilityTraits = {accessibilityTraits}
        disabled = {disabled}
        onPress = {onPress}>
        <View style = {buttonStyles}>
          <Text style = {textStyles} disabled = {disabled}>{formattedTitle}</Text>
        </View>
      </Touchable>
    );
  }
}

class WelcomeScreen extends Component {
  static navigationOptions = {
    title: 'Welcome',
  };
  constructor(props)
  {
    super(props);
    this._isMounted = false;
    this._checkingVersions = false;
    this.state = {
      pouchDBOn:false,
      checkingpouchDB:false,
      versions:[],
    };
  }
  refreshVersions() {
    if (this._checkingVersions) return;
    this._checkingVersions = true;
    getVersionsClient.getVersions()
    .then((response) => {
      if (this._isMounted) {
        var versionsArray = [];
        for (var prop in response){
          versionsArray.push({key:prop, value:response[prop]});
        }
        this.setState({versions : versionsArray});
        clearInterval(this.refreshVersionsTimer);
      }
    })
    .catch((err) => {})
    .then(() => {this._checkingVersions=false;})
  }
  refreshPouchState() {
    if (this.state.checkingpouchDB) return;
    this.setState({checkingpouchDB:true});
    localAlbumDB.getDbInfo()
    .then(response => {
      if (this._isMounted) {
        this.setState({pouchDBOn:true});
      }
      clearInterval(this.refreshTimerInterval);
    })
    .catch((err) => { if (this._isMounted) {
      this.setState({pouchDBOn:false});
    }})
    .then(() => { if (this._isMounted) {
      this.setState({checkingpouchDB:false});
    }})
  }
  componentWillMount() {
    this._isMounted=true;
    this.refreshTimerInterval=setInterval(() => {
      this.refreshPouchState();
    }, 1000);
    this.refreshVersionsTimer=setInterval(() => {
      this.refreshVersions();
    }, 1000);
  }
  componentWillUnmount() {
    this._isMounted = false;
    clearInterval(this.refreshTimerInterval);
    clearInterval(this.refreshVersionsTimer);
  }
  render() {
    const { navigate } = this.props.navigation;
    return(
      <ScrollView style = {{flex:1}}>
        <Text style = {styles.app_title}>
          PouchAlbum
        </Text>
        <Text style = {styles.app_description}>
          A React Native demo app that runs
        </Text>
        <Text style = {styles.app_description2}>
          PouchDB on Node.js (ChakraCore).
        </Text>
        <Text style = {styles.app_description}>
          Courtesy of JaneaSystems
        </Text>
        <OpenURLButton url = {'http://www.janeasystems.com'}
          >
          <Text style = {{textAlign:'center', textDecorationLine:'underline'}}>
            www.janeasystems.com
          </Text>
        </OpenURLButton>
        <View style = {{margin:10}}>
          <ResizableButton title = "View Albums >"
            textSize = {32}
            disabled = {!this.state.pouchDBOn}
            onPress = {() => {navigate('ChooseAlbum', {userNick: UUID.v1()})}}
            />
        </View>
        {(!this.state.pouchDBOn)?
          <View style = {{margin:10, alignItems:'center'}}>
            <Text>
              Starting PouchDB server
            </Text>
            <ProgressBar indeterminate={true}/>
          </View>
          : null
        }
        {(this.state.versions.length>0)?
          <View style = {{alignSelf:'center'}}>
            <Text style = {{textAlign:'center', fontSize:20, marginBottom:5 }}>
              Node.js versions
            </Text>
            <View style = {{flexDirection:'row'}}>
              <View>
                {
                  this.state.versions.map((item,index) => {
                    return (
                      <View
                        key = {item.key}
                        style = {{borderColor:'#DFE2E5',
                              borderBottomWidth:1,
                              borderLeftWidth:1,
                              borderRightWidth:1,
                              borderTopWidth:(index == 0 ? 1 : 0),
                              backgroundColor:(index%2 == 0) ? 'white' : '#F6F8FA'
                              }}
                        >
                        <Text style={{ margin:8 }}>
                          {item.key}
                        </Text>
                      </View>
                    );
                  })
                }
              </View>
              <View>
                {
                  this.state.versions.map((item,index) => {
                    return (
                      <View
                        key = {item.key}
                        style = {{borderColor:'#DFE2E5',
                              borderBottomWidth:1,
                              borderRightWidth:1,
                              borderTopWidth:(index == 0 ? 1 : 0),
                              backgroundColor:(index%2 == 0) ? 'white' : '#F6F8FA'
                              }}
                        >
                        <Text style = {{ margin:8 }}>
                          {item.value}
                        </Text>
                      </View>
                    );
                  })
                }
              </View>
            </View>
          </View>
        : null
        }
      </ScrollView>
    );
  }
}

class SelectableListItem extends React.PureComponent {
  _onPress = () => {
    this.props.onPressItem(this.props.id);
  };
  render() {
    return (
      <TouchableHighlight
        style = {styles.album_selectable_container}
        underlayColor='#EEEEEE'
        onPress = {this._onPress}
       >
        <View style = {{flex:1,
                      marginTop:15,
                      marginBottom:15,
                      marginLeft:5,
                      marginRight:5,
                      flexDirection:'row',
                      justifyContent:'space-between'
                    }}
          >
          <Text style = {{fontSize:20}}>
            {this.props.id}
          </Text>
          <Text style = {{color:'darkgray', fontSize:20}}>
            ({this.props.numberPhotos})
          </Text>
        </View>
      </TouchableHighlight>
    )
  }
}

class AvailableAlbumsList extends React.PureComponent {
  _keyExtractor = (item, index) => item.key;
  _onPressItem = (id: string) => {
    this.props.onSelect(id);
  };
  _renderItem = ({item}) => (
    <SelectableListItem
      id = {item.key}
      onPressItem = {this._onPressItem}
      numberPhotos = {item.value}
    />
  );
  render() {
    return (
      <FlatList
        data = {this.props.data}
        keyExtractor = {this._keyExtractor}
        renderItem = {this._renderItem}
      />
    );
  }
}

class ChooseAlbumScreen extends Component
{
  static navigationOptions = ({ navigation }) => ({
    title: "Albums",
    headerRight:
      <TouchableOpacity style={{marginRight:14}}
        onPress = {() =>navigation.state.params.showCreateAlbum()}
      >
        <Text style = {{color:"#037aff", fontSize:20}}>
          New
        </Text>
      </TouchableOpacity>
    ,
  });
  setInitialState() {
    return {
      albums:[],
      newAlbumName:'',
      runningInBG: false,
    }
  }
  constructor(props)
  {
    super(props);
    this._isMounted = false;
    this._defaultAlbums = ['General','Random'];
    this.state = this.setInitialState();
  }

  refreshAlbums() {
    if (this.state.runningInBG) return;
    this.setState({runningInBG:true});
    localAlbumDB.listAlbums()
    .then(response => {
      if (this._isMounted) {
        var albums = response.rows;
        var existingKeys = albums.map((elem) => elem.key );
        this._defaultAlbums.forEach(
          (item,index) => {
            if (existingKeys.indexOf(item)<0)
            {
              albums.push({key:item, value:'0'});
            }
          }
        )
        albums.sort((a,b) => {return a.key < b.key});
        this.setState({albums: albums});
      }
    })
    .catch((err) => { })
    .then(() => { if (this._isMounted) {
      this.setState({runningInBG:false});
    }})
  }
  componentWillMount() {
    this._isMounted = true;
    this.refreshTimerInterval = setInterval(() => {
      this.refreshAlbums();
    }, 5000);
    this.refreshAlbums();
  }
  componentDidMount() {
    this.props.navigation.setParams({showCreateAlbum:this._showCreateAlbum})
  }
  componentWillUnmount() {
    this._isMounted=false;
    clearInterval(this.refreshTimerInterval);
  }

  _enterAlbum=(id:string) => {
    const { params } = this.props.navigation.state;
    const {navigate} = this.props.navigation;
    navigate('ViewAlbum', {userNick:params.userNick, selectedAlbum: id});
  };
  _createAlbumAndEnter=(id:string) => {
    const { params } = this.props.navigation.state;
    localAlbumDB.createAlbumOpenPhoto(id, params.userNick, new Date());
    var albums = this.state.albums;
    var existingKeys = albums.map((elem) => elem.key );
    if (existingKeys.indexOf(id) < 0) {
      albums = albums.concat([{key:id, value:'0'}]);
      albums.sort((a,b) => {return a.key < b.key});
      this.setState({albums:albums});
    }
    if (this._defaultAlbums.indexOf(id)<0) {
      this._defaultAlbums.push(id);
    }
    this._enterAlbum(id);
  }
  _onSelectAlbum = (id:string) => {
    this._enterAlbum(id);
  };
  _createAlbum = (name:string) => {
    if (name.length > 0) {
      this._createAlbumAndEnter(name);
    }
  };
  _showCreateAlbum = () =>
  {
    this.setState({ createPromptVisible: true});
  }
  render() {
    const { params } = this.props.navigation.state;
    let albumItems = this.state.albums;
    return (
      <View style = {styles.regular_container}>
        <AvailableAlbumsList
          data = {albumItems}
          onSelect = {this._onSelectAlbum}
        />
        <Prompt
          title = "Create an album"
          placeholder = "Enter album name"
          visible = {this.state.createPromptVisible}
          submitText = "Create"
          textInputProps = {{autoCorrect: false}}
          onChangeText = {(value) => this.setState({ newAlbumName: value})}
          onCancel = {() => this.setState({ createPromptVisible: false})}
          onSubmit = {(value) => {this.setState({ createPromptVisible: false}); this._createAlbum(this.state.newAlbumName);}}
        />
      </View>
    );
  }
}

class ViewAlbumScreen extends Component
{
  static navigationOptions = ({ navigation }) => ({
    title: `${navigation.state.params.selectedAlbum}`,
    headerRight:
      <TouchableOpacity style = {{marginRight:14}}
        onPress = {() =>
          navigation.navigate('ComposePhoto',{
            currentAlbum:navigation.state.params.selectedAlbum,
            username:navigation.state.params.userNick,
          })
        }
      >
        <Text style = {{color:"#037aff",fontSize:20}}>
          Add
        </Text>
      </TouchableOpacity>
    ,
  });
  constructor(props) {
    super(props);
  }
  selectPhoto = (item) => {
    const { navigate } = this.props.navigation;
    navigate('FocusedImage',{selectedDoc:item});
  }
  render() {
    const { params } = this.props.navigation.state;
    return (
      <View style = {{flex:1}}>
        <AlbumView currentAlbum={params.selectedAlbum} username={params.userNick} onSelectPhoto={this.selectPhoto} />
      </View>
    )
  }
}

class ComposePhotoScreen extends Component
{
  static navigationOptions = ({ navigation }) => ({
    title: 'New Photo',
  });
  constructor(props)
  {
    super(props);
    this._isMounted = false;
    this.messageText = '';
    this.state = {
      imageURI: null,
      sendingInBG: false,
    };
  }
  componentWillMount()
  {
    this._isMounted = true;
  }
  componentWillUnmount()
  {
    this._isMounted = false;
  }
  sendPhoto = () => {
    if (this.state.sendingInBG) return;
    if (!this.state.imageURI) {
      alert("You have to select an image attachment!");
      return;
    }
    var navigate = this.props.navigation;
    const { params } = navigate.state;
    this.setState({sendingInBG:true});
    localAlbumDB.createPhoto(params.currentAlbum, params.username, new Date(), this.messageText, this.state.imageURI)
    .then(response => {
      if (this._isMounted) {
        navigate.goBack();
      }
    })
    .catch(err => alert(err.message))
    .then(() => { if (this._isMounted) {
      this.setState({sendingInBG:false});
    }});
  }
  selectGalleryImage = () => {
    ImagePickerIOS.openSelectDialog({}, (URI) => {
      this.setState({imageURI:URI});
    }, (err) => {
      alert(err);
    });
  }
  takeCameraPhoto = () => {
    ImagePickerIOS.openCameraDialog({}, (URI) => {
      this.setState({imageURI:URI});
    }, (err) => {
      alert(err);
    });
  }
  render() {
    const { params } = this.props.navigation.state;
    return(
      !(this.state.imageURI)?
        <View style={{flex:1, justifyContent:'center'}}>
          <ResizableButton style = {{margin:5}}
            key = 'addImageButton'
            title = 'Add image from Gallery'
            textSize = {25}
            onPress = {this.selectGalleryImage}
          />
          <ResizableButton style = {{margin:5}}
            key = 'takePhotoButton'
            title = 'Take camera photo'
            textSize = {25}
            onPress = {this.takeCameraPhoto}
          />
        </View>
      :
        <View style = {{flex:1}}>
          <View style = {{marginTop:20,marginBottom:6}} flexDirection='row'>
            <TextInput
              ref = {ref => this.textInputRef = ref}
              style = {{ flex:1, padding:3, marginLeft:5, height: 35, borderColor: 'gray', borderWidth: 1}}
              autoCapitalize = {'sentences'}
              placeholder = {'Add a caption...'}
              onChangeText = {(text) => {this.messageText=text;}}
              returnKeyType = {'send'}
            />
            <Button title = {'Add'}
              onPress = {this.sendPhoto}
              disabled = {this.state.sendingInBG}
            />
          </View>
          <View style = {{margin:3, height:8, alignItems:'center', alignContent:'center'}}>
            {(this.state.sendingInBG)?
              <ProgressBar indeterminate={true}/>
              : null
            }
          </View>
          <View style = {{flex:1}}>
            <Image style = {{flex:1}} resizeMode = {'contain'} source = {{uri:this.state.imageURI}}/>
          </View>
        </View>

    )
  }
}

class FocusedImageScreen extends Component {
  static navigationOptions = ({ navigation }) => ({
    title: 'View Photo',
  });
 constructor(props)
  {
    super(props);
  }
  render() {
    const { params } = this.props.navigation.state;
    var item = params.selectedDoc;
    return(
      <View style = {{flex:1,backgroundColor:'black'}}>
        <Image style = {{flex:1}} resizeMode={'contain'} source={{uri : localAlbumDB.createImageAttachmentURL(item)}}>
          <View style = {{flex:1, alignItems:'center', justifyContent:'flex-end', backgroundColor: 'rgba(0,0,0,0)',}}>
            <Text style = {{color:'white', fontSize:40, textAlign:'center', textShadowOffset: {width: 2, height: 2}, textShadowRadius: 1, textShadowColor: '#000000'}}>
              {item.doc.message}
            </Text>
          </View>
        </Image>
      </View>
    )
  }
}

const PouchAlbumApp = StackNavigator({
  Welcome: { screen: WelcomeScreen},
  ChooseAlbum: { screen: ChooseAlbumScreen},
  ViewAlbum: { screen: ViewAlbumScreen},
  ComposePhoto: { screen: ComposePhotoScreen},
  FocusedImage: { screen: FocusedImageScreen},
});

const styles = StyleSheet.create({
  app_title: {
    fontSize: 32,
    textAlign: 'center',
    margin: 12,
  },
  app_description: {
    textAlign: 'center',
    color: '#333333',
    marginBottom: 0,
  },
  app_description2: {
    textAlign: 'center',
    color: '#333333',
    marginBottom: 12,
  },
  regular_container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#F5FCFF',
  },
  album_selectable_container: {
    flex:1,
    flexDirection: 'row',
    backgroundColor: '#E5E5E5',
    marginTop: 6,
    marginLeft: 6,
    marginRight: 6,
  },
  photo_image_small: {
    flex:1,
    borderWidth:1,
    margin:2,
  },
});

AppRegistry.registerComponent('PouchAlbum', () => PouchAlbumApp);
