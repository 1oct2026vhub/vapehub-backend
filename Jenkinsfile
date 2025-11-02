def branchName = env.BRANCH_NAME

pipeline {
    agent any

    parameters {
        string(name: 'dev_server', defaultValue: '13.61.169.67', description: 'Development Server')
        string(name: 'production_server', defaultValue: '', description: 'Production Server')

    }

    stages {
        stage('SonarQube Analysis') {
           steps {
               script {
                   def scannerHome = tool 'AteamSonarTool';
                   withSonarQubeEnv() {
                       sh "${scannerHome}/bin/sonar-scanner"
                   }
               }
           }            
        }

        stage('Deploy') {
            steps {                
                script {
                      // Check the current branch name
                    def server
                    def sshCredentials

                    if (branchName == 'staging') {
                        // Use deployment parameters
                        server = params.dev_server
                        sshCredentials = '5918cce5-91ae-41e6-aa94-bf269093dee1'
                    } else if (branchName == 'main') {
                        // Use production parameters
                        echo "Branch $branchName not configured for deployment."
                        return
                        server = params.dev_server
                        sshCredentials = '17ec0c13-3df4-475f-ba8d-e852220e21aa'
                    } else {
                        // Handle other branches if needed
                        echo "Branch $branchName not configured for deployment."
                        return
                    }

                    // Use SSH credentials with sshagent
                    sshagent([sshCredentials]) {
                        // SSH into the server and run commands
                        sh "ssh ubuntu@${server} \"cd /var/www/Backend/ && git pull\""
                        sh "ssh ubuntu@${server} \"cd /var/www/Backend/ && source ~/.nvm/nvm.sh && npm install \""
                        sh "ssh ubuntu@${server} \"cd /var/www/Backend/ && source ~/.nvm/nvm.sh && npm run migrate \""
                        sh "ssh ubuntu@${server} \"source ~/.nvm/nvm.sh && pm2 restart 'Backend' \"" 
                    }
}
            }
        }       
    }
    post {
        always {
            emailext (
                subject: "Jenkins Build ${currentBuild.result}",
                body: """<p>The Jenkins build for ${env.JOB_NAME} has finished.</p>
                        <p>Build result: ${currentBuild.result}</p>""",
                to: "mahesh@ateamsoftsolutions.com, deepu@ateamsoftsolutions.com",
                attachLog: true,
                compressLog: true,
                replyTo: 'noreply@example.com'
            )
        }        
    }

}
