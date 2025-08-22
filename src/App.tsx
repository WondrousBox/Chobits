// import UpdateElectron from '@/components/update'
import { AIAssistant } from './components/AIAssistant'
import FileBox from './components/FileBox'

function App() {
  const isFileBox = window.location.hash === '#filebox'
  return (
    <div className='App'>
      <div className="app-container">
        {isFileBox ? <FileBox /> : <AIAssistant />}
      </div>
      {/* <div className='flex-center'>
        Place static files into the<code>/public</code> folder <img style={{ width: '5em' }} src='./node.svg' alt='Node logo' />
      </div> */}
      {/* <UpdateElectron /> */}
    </div>
  )
}

export default App