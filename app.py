from flask import Flask, request, jsonify, send_from_directory
import json
import os
from datetime import datetime

app = Flask(__name__)

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

@app.route('/contact', methods=['POST'])
def contact():
    data = request.form
    contact_data = {
        'name': data.get('name'),
        'email': data.get('email'),
        'message': data.get('message'),
        'service_type': data.get('service-type'),
        'timestamp': datetime.now().isoformat()
    }

    contacts_file = 'contacts.json'
    contacts = []
    if os.path.exists(contacts_file):
        with open(contacts_file, 'r') as f:
            contacts = json.load(f)

    contacts.append(contact_data)

    with open(contacts_file, 'w') as f:
        json.dump(contacts, f, indent=2)

    return jsonify({'success': True, 'message': '¡Gracias por tu interés! Nos pondremos en contacto pronto.'})

if __name__ == '__main__':
    app.run(debug=True)